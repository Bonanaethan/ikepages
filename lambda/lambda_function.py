import json
import boto3
import uuid
from datetime import datetime, timezone

dynamodb = boto3.resource('dynamodb', region_name='ca-central-1')
s3 = boto3.client('s3', region_name='ca-central-1')
S3_BUCKET = 'hw.ikids.education'
cognito = boto3.client('cognito-idp', region_name='ca-central-1')
TABLE = 'ikids-data'
USER_POOL_ID = 'ca-central-1_iIZCbfNW9'

HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': 'https://hw.ikids.education',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
}

def resp(status, body):
    return {'statusCode': status, 'headers': HEADERS, 'body': json.dumps(body, default=str)}

def get_role(event):
    try:
        claims = event['requestContext']['authorizer']['jwt']['claims']
        groups = claims.get('cognito:groups', '')
        if isinstance(groups, list):
            groups_list = groups
        else:
            groups_list = groups.replace('[','').replace(']','').replace('"','').split(',') if groups else []
        groups_list = [g.strip() for g in groups_list]
        if 'admins' in groups_list: return 'admin'
        if 'teachers' in groups_list: return 'teacher'
        if 'students' in groups_list: return 'student'
        return None
    except:
        return NoneI 

def get_username(event):
    try:
        return event['requestContext']['authorizer']['jwt']['claims'].get('cognito:username')
    except:
        return None

def get_student_course_ids(table, username):
    """Get all course IDs accessible to a student via their classes."""
    classes_result = table.query(
        KeyConditionExpression=boto3.dynamodb.conditions.Key('pk').eq('CLASS')
    )
    course_ids = set()
    for cls in classes_result.get('Items', []):
        if username in (cls.get('members') or []):
            if cls.get('courseId'):
                course_ids.add(cls['courseId'])
    return list(course_ids)

def lambda_handler(event, context):
    method = event['requestContext']['http']['method']
    path = event['requestContext']['http']['path']
    table = dynamodb.Table(TABLE)

    if method == 'OPTIONS':
        return resp(200, {})

    # ==================== USERS ====================

    if method == 'POST' and path == '/prod/users':
        if get_role(event) not in ('teacher', 'admin'):
            return resp(403, {'error': 'Forbidden'})
        body = json.loads(event.get('body') or '{}')
        username, password, email = body.get('username'), body.get('password'), body.get('email')
        group = body.get('group', 'students')
        if not all([username, password, email]):
            return resp(400, {'error': 'Missing fields'})
        try:
            cognito.admin_create_user(
                UserPoolId=USER_POOL_ID, Username=username,
                TemporaryPassword=password, MessageAction='SUPPRESS',
                UserAttributes=[
                    {'Name': 'email', 'Value': email},
                    {'Name': 'email_verified', 'Value': 'true'}
                ]
            )
            cognito.admin_set_user_password(UserPoolId=USER_POOL_ID, Username=username, Password=password, Permanent=True)
            cognito.admin_add_user_to_group(UserPoolId=USER_POOL_ID, Username=username, GroupName=group)
            return resp(200, {'message': 'User created'})
        except Exception as e:
            return resp(500, {'error': str(e)})

    if method == 'GET' and path == '/prod/users':
        if get_role(event) not in ('teacher', 'admin'):
            return resp(403, {'error': 'Forbidden'})
        try:
            result = cognito.list_users(UserPoolId=USER_POOL_ID)
            users = []
            for u in result['Users']:
                attrs = {a['Name']: a['Value'] for a in u['Attributes']}
                groups_res = cognito.admin_list_groups_for_user(UserPoolId=USER_POOL_ID, Username=u['Username'])
                user_groups = [g['GroupName'] for g in groups_res['Groups']]
                users.append({'username': u['Username'], 'email': attrs.get('email', ''), 'groups': user_groups})
            return resp(200, users)
        except Exception as e:
            return resp(500, {'error': str(e)})

    if method == 'PUT' and path.startswith('/prod/admin/users/'):
        if get_role(event) != 'admin':
            return resp(403, {'error': 'Forbidden'})
        target_username = path.split('/')[-1]
        body = json.loads(event.get('body') or '{}')
        try:
            new_group = body.get('group')
            if new_group:
                groups_res = cognito.admin_list_groups_for_user(UserPoolId=USER_POOL_ID, Username=target_username)
                for g in groups_res['Groups']:
                    cognito.admin_remove_user_from_group(UserPoolId=USER_POOL_ID, Username=target_username, GroupName=g['GroupName'])
                cognito.admin_add_user_to_group(UserPoolId=USER_POOL_ID, Username=target_username, GroupName=new_group)
            if body.get('firstName') or body.get('lastName') or body.get('dob'):
                existing = table.get_item(Key={'pk': 'PROFILE', 'sk': target_username}).get('Item', {})
                table.put_item(Item={
                    'pk': 'PROFILE', 'sk': target_username,
                    'firstName': body.get('firstName', existing.get('firstName', '')),
                    'lastName': body.get('lastName', existing.get('lastName', '')),
                    'dob': body.get('dob', existing.get('dob', '')),
                    'updatedAt': datetime.now(timezone.utc).isoformat()
                })
            return resp(200, {'message': 'User updated'})
        except Exception as e:
            return resp(500, {'error': str(e)})

    if method == 'DELETE' and path.startswith('/prod/admin/users/'):
        if get_role(event) != 'admin':
            return resp(403, {'error': 'Forbidden'})
        target_username = path.split('/')[-1]
        try:
            cognito.admin_delete_user(UserPoolId=USER_POOL_ID, Username=target_username)
            table.delete_item(Key={'pk': 'PROFILE', 'sk': target_username})
            return resp(200, {'message': 'User deleted'})
        except Exception as e:
            return resp(500, {'error': str(e)})

    if method == 'GET' and path == '/prod/admin/users':
        if get_role(event) != 'admin':
            return resp(403, {'error': 'Forbidden'})
        try:
            result = cognito.list_users(UserPoolId=USER_POOL_ID)
            users = []
            for u in result['Users']:
                attrs = {a['Name']: a['Value'] for a in u['Attributes']}
                groups_res = cognito.admin_list_groups_for_user(UserPoolId=USER_POOL_ID, Username=u['Username'])
                user_groups = [g['GroupName'] for g in groups_res['Groups']]
                profile = table.get_item(Key={'pk': 'PROFILE', 'sk': u['Username']}).get('Item', {})
                users.append({
                    'username': u['Username'],
                    'email': attrs.get('email', ''),
                    'status': u['UserStatus'],
                    'groups': user_groups,
                    'firstName': profile.get('firstName', ''),
                    'lastName': profile.get('lastName', ''),
                    'dob': profile.get('dob', '')
                })
            return resp(200, users)
        except Exception as e:
            return resp(500, {'error': str(e)})

    # ==================== COURSES ====================
    # Courses are the curriculum units. Handouts and homework belong to courses.

    if method == 'GET' and path == '/prod/admin/courses':
        if get_role(event) not in ('admin', 'teacher'):
            return resp(403, {'error': 'Forbidden'})
        result = table.query(KeyConditionExpression=boto3.dynamodb.conditions.Key('pk').eq('COURSE'))
        return resp(200, result.get('Items', []))

    # GET /courses — public course list for all authenticated users
    if method == 'GET' and path == '/prod/courses':
        result = table.query(KeyConditionExpression=boto3.dynamodb.conditions.Key('pk').eq('COURSE'))
        return resp(200, result.get('Items', []))

    if method == 'POST' and path == '/prod/admin/courses':
        if get_role(event) != 'admin':
            return resp(403, {'error': 'Forbidden'})
        body = json.loads(event.get('body') or '{}')
        if not body.get('name'):
            return resp(400, {'error': 'Missing name'})
        course_id = str(int(datetime.now(timezone.utc).timestamp() * 1000))
        table.put_item(Item={
            'pk': 'COURSE', 'sk': course_id,
            'name': body['name'], 'description': body.get('description', ''),
            'createdAt': datetime.now(timezone.utc).isoformat()
        })
        return resp(200, {'message': 'Course created', 'id': course_id})

    if method == 'DELETE' and path.startswith('/prod/admin/courses/'):
        if get_role(event) != 'admin':
            return resp(403, {'error': 'Forbidden'})
        table.delete_item(Key={'pk': 'COURSE', 'sk': path.split('/')[-1]})
        return resp(200, {'message': 'Deleted'})

    # ==================== CLASSES ====================
    # Classes are groups of students. Each class belongs to one course.

    # GET /my/classes — get classes the current student belongs to (any role)
    if method == 'GET' and path == '/prod/my/classes':
        try:
            username = get_username(event)
            result = table.query(KeyConditionExpression=boto3.dynamodb.conditions.Key('pk').eq('CLASS'))
            my_classes = [c for c in result.get('Items', []) if username in (c.get('members') or [])]
            return resp(200, my_classes)
        except Exception as e:
            return resp(500, {'error': str(e)})

    if method == 'GET' and path == '/prod/admin/classes':
        if get_role(event) not in ('admin', 'teacher'):
            return resp(403, {'error': 'Forbidden'})
        result = table.query(KeyConditionExpression=boto3.dynamodb.conditions.Key('pk').eq('CLASS'))
        return resp(200, result.get('Items', []))

    if method == 'POST' and path == '/prod/admin/classes':
        if get_role(event) != 'admin':
            return resp(403, {'error': 'Forbidden'})
        body = json.loads(event.get('body') or '{}')
        if not body.get('name'):
            return resp(400, {'error': 'Missing name'})
        class_id = str(int(datetime.now(timezone.utc).timestamp() * 1000))
        table.put_item(Item={
            'pk': 'CLASS', 'sk': class_id,
            'name': body['name'],
            'courseId': body.get('courseId', ''),
            'members': [],
            'createdAt': datetime.now(timezone.utc).isoformat()
        })
        return resp(200, {'message': 'Class created', 'id': class_id})

    if method == 'PUT' and path.startswith('/prod/admin/classes/') and not '/members' in path and not path.endswith('/schedule') and not '/attendance/' in path and not path.endswith('/hw-status'):
        if get_role(event) != 'admin':
            return resp(403, {'error': 'Forbidden'})
        class_id = path.split('/')[-1]
        body = json.loads(event.get('body') or '{}')
        existing = table.get_item(Key={'pk': 'CLASS', 'sk': class_id}).get('Item', {})
        table.put_item(Item={
            'pk': 'CLASS', 'sk': class_id,
            'name': body.get('name', existing.get('name', '')),
            'courseId': body.get('courseId', existing.get('courseId', '')),
            'members': existing.get('members', []),
            'createdAt': existing.get('createdAt', ''),
            'updatedAt': datetime.now(timezone.utc).isoformat()
        })
        return resp(200, {'message': 'Class updated'})

    if method == 'DELETE' and path.startswith('/prod/admin/classes/') and '/members/' not in path and not path.endswith('/members'):
        if get_role(event) != 'admin':
            return resp(403, {'error': 'Forbidden'})
        table.delete_item(Key={'pk': 'CLASS', 'sk': path.split('/')[-1]})
        return resp(200, {'message': 'Deleted'})

    # POST /admin/classes/{id}/members — add member
    if method == 'POST' and path.startswith('/prod/admin/classes/') and path.endswith('/members'):
        if get_role(event) != 'admin':
            return resp(403, {'error': 'Forbidden'})
        class_id = path.split('/')[4]
        body = json.loads(event.get('body') or '{}')
        username = body.get('username')
        if not username:
            return resp(400, {'error': 'Missing username'})
        result = table.get_item(Key={'pk': 'CLASS', 'sk': class_id})
        item = result.get('Item')
        if not item:
            return resp(404, {'error': 'Class not found'})
        members = item.get('members', [])
        if username not in members:
            members.append(username)
        table.update_item(Key={'pk': 'CLASS', 'sk': class_id}, UpdateExpression='SET members = :m', ExpressionAttributeValues={':m': members})
        return resp(200, {'message': 'Member added'})

    # DELETE /admin/classes/{id}/members/{username} — remove member
    if method == 'DELETE' and path.startswith('/prod/admin/classes/') and '/members/' in path:
        if get_role(event) != 'admin':
            return resp(403, {'error': 'Forbidden'})
        parts = path.split('/')
        class_id = parts[4]
        target_username = parts[6]
        result = table.get_item(Key={'pk': 'CLASS', 'sk': class_id})
        item = result.get('Item')
        if not item:
            return resp(404, {'error': 'Class not found'})
        members = [m for m in item.get('members', []) if m != target_username]
        table.update_item(Key={'pk': 'CLASS', 'sk': class_id}, UpdateExpression='SET members = :m', ExpressionAttributeValues={':m': members})
        return resp(200, {'message': 'Member removed'})

    # ==================== ASSIGNMENTS ====================

    if method == 'POST' and path == '/prod/assignments':
        if get_role(event) not in ('teacher', 'admin'):
            return resp(403, {'error': 'Forbidden'})
        body = json.loads(event.get('body') or '{}')
        if not body.get('title'):
            return resp(400, {'error': 'Missing title'})
        item_id = str(int(datetime.now(timezone.utc).timestamp() * 1000))
        table.put_item(Item={
            'pk': 'ASSIGNMENT', 'sk': item_id,
            'title': body['title'], 'subject': body.get('subject', ''),
            'content': body.get('content', ''), 'dueDate': body.get('dueDate', ''),
            'courseId': body.get('courseId', ''), 'assignedTo': body.get('assignedTo', 'all'),
            'createdAt': datetime.now(timezone.utc).isoformat()
        })
        return resp(200, {'message': 'Assignment created', 'id': item_id})

    if method == 'GET' and path == '/prod/assignments':
        try:
            username = get_username(event)
            result = table.query(KeyConditionExpression=boto3.dynamodb.conditions.Key('pk').eq('ASSIGNMENT'))
            items = result.get('Items', [])
            role = get_role(event)
            if role in ('teacher', 'admin'):
                return resp(200, items)
            # Students see assignments whose courseId matches their enrolled courses
            student_course_ids = get_student_course_ids(table, username)
            visible = [a for a in items if
                not a.get('courseId') or
                a.get('courseId') in student_course_ids or
                a.get('assignedTo') == 'all' or
                username in (a.get('assignedTo') or [])
            ]
            return resp(200, visible)
        except Exception as e:
            return resp(500, {'error': str(e)})

    if method == 'PUT' and path.startswith('/prod/assignments/') and not path.endswith('/done'):
        if get_role(event) not in ('teacher', 'admin'):
            return resp(403, {'error': 'Forbidden'})
        item_id = path.split('/')[-1]
        body = json.loads(event.get('body') or '{}')
        table.put_item(Item={
            'pk': 'ASSIGNMENT', 'sk': item_id,
            'title': body.get('title', ''), 'subject': body.get('subject', ''),
            'content': body.get('content', ''), 'dueDate': body.get('dueDate', ''),
            'courseId': body.get('courseId', ''), 'assignedTo': body.get('assignedTo', 'all'),
            'updatedAt': datetime.now(timezone.utc).isoformat()
        })
        return resp(200, {'message': 'Updated'})

    if method == 'DELETE' and path.startswith('/prod/assignments/') and not path.endswith('/done'):
        if get_role(event) not in ('teacher', 'admin'):
            return resp(403, {'error': 'Forbidden'})
        table.delete_item(Key={'pk': 'ASSIGNMENT', 'sk': path.split('/')[-1]})
        return resp(200, {'message': 'Deleted'})

    if method == 'POST' and path.startswith('/prod/assignments/') and path.endswith('/done'):
        try:
            username = get_username(event)
            item_id = path.split('/')[3]
            body = json.loads(event.get('body') or '{}')
            table.put_item(Item={'pk': f'DONE#{username}', 'sk': item_id, 'done': body.get('done', True), 'updatedAt': datetime.now(timezone.utc).isoformat()})
            return resp(200, {'message': 'Updated'})
        except Exception as e:
            return resp(500, {'error': str(e)})

    if method == 'GET' and path == '/prod/assignments/done':
        try:
            username = get_username(event)
            result = table.query(KeyConditionExpression=boto3.dynamodb.conditions.Key('pk').eq(f'DONE#{username}'))
            return resp(200, {item['sk']: item.get('done', False) for item in result.get('Items', [])})
        except Exception as e:
            return resp(500, {'error': str(e)})

    # ==================== SUBMISSIONS ====================

    if method == 'POST' and path == '/prod/submissions':
        try:
            username = get_username(event)
            body = json.loads(event.get('body') or '{}')
            assignment_id = body.get('assignmentId')
            if not assignment_id:
                return resp(400, {'error': 'Missing assignmentId'})
            existing = table.get_item(Key={'pk': f'SUBMISSION#{assignment_id}', 'sk': username}).get('Item', {})
            if existing.get('submitted') and not body.get('cancel'):
                return resp(403, {'error': 'Already submitted'})
            submitted = body.get('submitted', False)
            if body.get('cancel'):
                submitted = False
            table.put_item(Item={
                'pk': f'SUBMISSION#{assignment_id}', 'sk': username,
                'files': body.get('files', existing.get('files', [])),
                'note': body.get('note', existing.get('note', '')),
                'answers': body.get('answers', existing.get('answers', {})),
                'submitted': submitted,
                'submittedAt': datetime.now(timezone.utc).isoformat() if submitted else '',
                'savedAt': datetime.now(timezone.utc).isoformat()
            })
            return resp(200, {'message': 'Cancelled' if body.get('cancel') else ('Submitted' if submitted else 'Saved')})
        except Exception as e:
            return resp(500, {'error': str(e)})

    if method == 'GET' and path.startswith('/prod/submissions/'):
        try:
            username = get_username(event)
            assignment_id = path.split('/')[-1]
            role = get_role(event)
            if role in ('teacher', 'admin'):
                result = table.query(KeyConditionExpression=boto3.dynamodb.conditions.Key('pk').eq(f'SUBMISSION#{assignment_id}'))
                return resp(200, result.get('Items', []))
            else:
                result = table.get_item(Key={'pk': f'SUBMISSION#{assignment_id}', 'sk': username})
                return resp(200, result.get('Item', {}))
        except Exception as e:
            return resp(500, {'error': str(e)})

    # ==================== HANDOUTS ====================

    if method == 'POST' and path == '/prod/handouts':
        if get_role(event) not in ('teacher', 'admin'):
            return resp(403, {'error': 'Forbidden'})
        body = json.loads(event.get('body') or '{}')
        if not body.get('title'):
            return resp(400, {'error': 'Missing title'})
        item_id = str(int(datetime.now(timezone.utc).timestamp() * 1000))
        table.put_item(Item={
            'pk': 'HANDOUT', 'sk': item_id,
            'title': body['title'], 'url': body.get('url', ''),
            'description': body.get('description', ''), 'content': body.get('content', ''),
            'courseId': body.get('courseId', ''), 'createdAt': datetime.now(timezone.utc).isoformat()
        })
        return resp(200, {'message': 'Handout created', 'id': item_id})

    if method == 'GET' and path == '/prod/handouts':
        try:
            username = get_username(event)
            role = get_role(event)
            result = table.query(KeyConditionExpression=boto3.dynamodb.conditions.Key('pk').eq('HANDOUT'))
            all_handouts = result.get('Items', [])
            if role in ('teacher', 'admin'):
                return resp(200, all_handouts)
            # Students see handouts whose courseId matches their enrolled courses
            student_course_ids = get_student_course_ids(table, username)
            visible = [h for h in all_handouts if not h.get('courseId') or h.get('courseId') in student_course_ids]
            return resp(200, visible)
        except Exception as e:
            return resp(500, {'error': str(e)})

    if method == 'PUT' and path.startswith('/prod/handouts/'):
        if get_role(event) not in ('teacher', 'admin'):
            return resp(403, {'error': 'Forbidden'})
        item_id = path.split('/')[-1]
        body = json.loads(event.get('body') or '{}')
        table.put_item(Item={
            'pk': 'HANDOUT', 'sk': item_id,
            'title': body.get('title', ''), 'url': body.get('url', ''),
            'description': body.get('description', ''), 'content': body.get('content', ''),
            'courseId': body.get('courseId', ''), 'updatedAt': datetime.now(timezone.utc).isoformat()
        })
        return resp(200, {'message': 'Updated'})

    if method == 'DELETE' and path.startswith('/prod/handouts/'):
        if get_role(event) not in ('teacher', 'admin'):
            return resp(403, {'error': 'Forbidden'})
        table.delete_item(Key={'pk': 'HANDOUT', 'sk': path.split('/')[-1]})
        return resp(200, {'message': 'Deleted'})

    # ==================== UPLOAD ====================

    if method == 'POST' and path == '/prod/upload-url':
        if get_role(event) not in ('teacher', 'admin', 'student'):
            return resp(403, {'error': 'Forbidden'})
        body = json.loads(event.get('body') or '{}')
        filename = body.get('filename', 'file')
        content_type = body.get('contentType', 'application/octet-stream')
        key = f"uploads/{uuid.uuid4()}-{filename}"
        try:
            url = s3.generate_presigned_url('put_object', Params={'Bucket': S3_BUCKET, 'Key': key, 'ContentType': content_type}, ExpiresIn=300)
            return resp(200, {'uploadUrl': url, 'publicUrl': f"https://{S3_BUCKET}/{key}", 'key': key})
        except Exception as e:
            return resp(500, {'error': str(e)})

    # ==================== ANNOUNCEMENTS ====================

    if method == 'GET' and path == '/prod/announcements':
        try:
            username = get_username(event)
            role = get_role(event)
            result = table.query(KeyConditionExpression=boto3.dynamodb.conditions.Key('pk').eq('ANNOUNCEMENT'))
            items = result.get('Items', [])
            if role in ('teacher', 'admin'):
                return resp(200, items)
            # Get student's class IDs
            classes_result = table.query(KeyConditionExpression=boto3.dynamodb.conditions.Key('pk').eq('CLASS'))
            student_class_ids = [c['sk'] for c in classes_result.get('Items', []) if username in (c.get('members') or [])]
            visible = []
            for a in items:
                assigned = a.get('assignedTo', 'all')
                if assigned == 'all':
                    visible.append(a)
                elif isinstance(assigned, list):
                    if username in assigned or any(cid in assigned for cid in student_class_ids):
                        visible.append(a)
            return resp(200, visible)
        except Exception as e:
            return resp(500, {'error': str(e)})

    if method == 'POST' and path == '/prod/announcements':
        if get_role(event) not in ('teacher', 'admin'):
            return resp(403, {'error': 'Forbidden'})
        body = json.loads(event.get('body') or '{}')
        if not body.get('title'):
            return resp(400, {'error': 'Missing title'})
        item_id = str(int(datetime.now(timezone.utc).timestamp() * 1000))
        table.put_item(Item={
            'pk': 'ANNOUNCEMENT', 'sk': item_id,
            'title': body['title'], 'message': body.get('message', ''),
            'assignedTo': body.get('assignedTo', 'all'),
            'createdAt': datetime.now(timezone.utc).isoformat()
        })
        return resp(200, {'message': 'Created', 'id': item_id})

    if method == 'PUT' and path.startswith('/prod/announcements/'):
        if get_role(event) not in ('teacher', 'admin'):
            return resp(403, {'error': 'Forbidden'})
        item_id = path.split('/')[-1]
        body = json.loads(event.get('body') or '{}')
        table.put_item(Item={
            'pk': 'ANNOUNCEMENT', 'sk': item_id,
            'title': body.get('title', ''), 'message': body.get('message', ''),
            'assignedTo': body.get('assignedTo', 'all'),
            'updatedAt': datetime.now(timezone.utc).isoformat()
        })
        return resp(200, {'message': 'Updated'})

    if method == 'DELETE' and path.startswith('/prod/announcements/'):
        if get_role(event) not in ('teacher', 'admin'):
            return resp(403, {'error': 'Forbidden'})
        table.delete_item(Key={'pk': 'ANNOUNCEMENT', 'sk': path.split('/')[-1]})
        return resp(200, {'message': 'Deleted'})

    # ==================== PROFILE ====================

    if method == 'GET' and path == '/prod/profile':
        try:
            username = get_username(event)
            result = table.get_item(Key={'pk': 'PROFILE', 'sk': username})
            return resp(200, result.get('Item', {}))
        except Exception as e:
            return resp(500, {'error': str(e)})

    if method == 'POST' and path == '/prod/profile':
        try:
            username = get_username(event)
            body = json.loads(event.get('body') or '{}')
            if not body.get('firstName') or not body.get('lastName') or not body.get('dob'):
                return resp(400, {'error': 'Missing fields'})
            table.put_item(Item={
                'pk': 'PROFILE', 'sk': username,
                'firstName': body['firstName'], 'lastName': body['lastName'],
                'dob': body['dob'], 'updatedAt': datetime.now(timezone.utc).isoformat()
            })
            return resp(200, {'message': 'Profile saved'})
        except Exception as e:
            return resp(500, {'error': str(e)})

    # ==================== MARKED HOMEWORK ====================

    # GET /marked/{assignmentId}/{username} — get marked file for a student (teacher sees any, student sees own)
    if method == 'GET' and path.startswith('/prod/marked/'):
        try:
            parts = path.split('/')
            assignment_id = parts[3]
            target_username = parts[4] if len(parts) > 4 else get_username(event)
            role = get_role(event)
            current_user = get_username(event)
            # Students can only see their own
            if role == 'student' and target_username != current_user:
                return resp(403, {'error': 'Forbidden'})
            # Find the class for this student+assignment
            classes_result = table.query(KeyConditionExpression=boto3.dynamodb.conditions.Key('pk').eq('CLASS'))
            marked_file = ''
            marked_file_name = ''
            for cls in classes_result.get('Items', []):
                if target_username in (cls.get('members') or []):
                    class_id = cls['sk']
                    overrides_result = table.get_item(Key={'pk': f'HW_STATUS#{class_id}', 'sk': 'overrides'})
                    overrides = overrides_result.get('Item', {}).get('data', {})
                    key = f'{target_username}#{assignment_id}'
                    marked_data = overrides.get(key, {})
                    if marked_data.get('markedFile'):
                        marked_file = marked_data['markedFile']
                        marked_file_name = marked_data.get('markedFileName', 'Marked homework')
                        break
            return resp(200, {'markedFile': marked_file, 'markedFileName': marked_file_name})
        except Exception as e:
            return resp(500, {'error': str(e)})

    # PUT /marked/{assignmentId}/{username} — upload marked file (teacher/admin only)
    if method == 'PUT' and path.startswith('/prod/marked/'):
        if get_role(event) not in ('teacher', 'admin'):
            return resp(403, {'error': 'Forbidden'})
        try:
            parts = path.split('/')
            assignment_id = parts[3]
            target_username = parts[4]
            body = json.loads(event.get('body') or '{}')
            marked_file = body.get('markedFile', '')
            marked_file_name = body.get('markedFileName', '')
            # Find the student's class and save there
            classes_result = table.query(KeyConditionExpression=boto3.dynamodb.conditions.Key('pk').eq('CLASS'))
            saved = False
            for cls in classes_result.get('Items', []):
                if target_username in (cls.get('members') or []):
                    class_id = cls['sk']
                    overrides_result = table.get_item(Key={'pk': f'HW_STATUS#{class_id}', 'sk': 'overrides'})
                    overrides = overrides_result.get('Item', {}).get('data', {})
                    key = f'{target_username}#{assignment_id}'
                    if key not in overrides:
                        overrides[key] = {}
                    overrides[key]['markedFile'] = marked_file
                    overrides[key]['markedFileName'] = marked_file_name
                    table.put_item(Item={
                        'pk': f'HW_STATUS#{class_id}', 'sk': 'overrides',
                        'data': overrides,
                        'updatedAt': datetime.now(timezone.utc).isoformat()
                    })
                    saved = True
                    break
            if not saved:
                return resp(404, {'error': 'Student not found in any class'})

            # Get assignment title for notification
            assignment = table.get_item(Key={'pk': 'ASSIGNMENT', 'sk': assignment_id}).get('Item', {})
            assignment_title = assignment.get('title', 'your homework')

            # Create notification announcement for the student
            notif_id = str(int(datetime.now(timezone.utc).timestamp() * 1000))
            table.put_item(Item={
                'pk': 'ANNOUNCEMENT', 'sk': notif_id,
                'title': f'✅ Homework marked: {assignment_title}',
                'message': f'Your submission for "{assignment_title}" has been marked. Open the homework to view your marked file.',
                'assignedTo': [target_username],
                'type': 'hw_marked',
                'assignmentId': assignment_id,
                'createdAt': datetime.now(timezone.utc).isoformat()
            })

            return resp(200, {'message': 'Marked file saved'})
        except Exception as e:
            return resp(500, {'error': str(e)})

    # ==================== SCHEDULE ====================

    # GET /admin/classes/{id}/schedule
    if method == 'GET' and path.startswith('/prod/admin/classes/') and path.endswith('/schedule'):
        if get_role(event) not in ('admin', 'teacher', 'student'):
            return resp(403, {'error': 'Forbidden'})
        class_id = path.split('/')[4]
        # Students can only read schedules for classes they belong to
        if get_role(event) == 'student':
            username = get_username(event)
            cls = table.get_item(Key={'pk': 'CLASS', 'sk': class_id}).get('Item', {})
            if username not in (cls.get('members') or []):
                return resp(403, {'error': 'Forbidden'})
        result = table.get_item(Key={'pk': f'SCHEDULE#{class_id}', 'sk': 'schedule'})
        return resp(200, result.get('Item', {}))

    # PUT /admin/classes/{id}/schedule
    if method == 'PUT' and path.startswith('/prod/admin/classes/') and path.endswith('/schedule'):
        if get_role(event) not in ('admin', 'teacher'):
            return resp(403, {'error': 'Forbidden'})
        class_id = path.split('/')[4]
        body = json.loads(event.get('body') or '{}')
        table.put_item(Item={
            'pk': f'SCHEDULE#{class_id}', 'sk': 'schedule',
            'sessions': body.get('sessions', []),
            'startTime': body.get('startTime', ''),
            'endTime': body.get('endTime', ''),
            'updatedAt': datetime.now(timezone.utc).isoformat()
        })
        return resp(200, {'message': 'Schedule saved'})

    # ==================== ATTENDANCE ====================

    # GET /admin/classes/{id}/attendance/{date}
    if method == 'GET' and path.startswith('/prod/admin/classes/') and '/attendance/' in path:
        if get_role(event) not in ('admin', 'teacher', 'student'):
            return resp(403, {'error': 'Forbidden'})
        parts = path.split('/')
        class_id = parts[4]
        date = parts[6]
        # Students can only read attendance for classes they belong to
        if get_role(event) == 'student':
            username = get_username(event)
            cls = table.get_item(Key={'pk': 'CLASS', 'sk': class_id}).get('Item', {})
            if username not in (cls.get('members') or []):
                return resp(403, {'error': 'Forbidden'})
        result = table.get_item(Key={'pk': f'ATTENDANCE#{class_id}', 'sk': date})
        return resp(200, result.get('Item', {'records': {}}))

    # PUT /admin/classes/{id}/attendance/{date}
    if method == 'PUT' and path.startswith('/prod/admin/classes/') and '/attendance/' in path:
        role = get_role(event)
        if role not in ('admin', 'teacher', 'student'):
            return resp(403, {'error': 'Forbidden'})
        parts = path.split('/')
        class_id = parts[4]
        date = parts[6]
        body = json.loads(event.get('body') or '{}')
        # Students can only update their own record
        if role == 'student':
            username = get_username(event)
            new_status = body.get('status')
            if not new_status:
                return resp(400, {'error': 'Missing status'})
            existing = table.get_item(Key={'pk': f'ATTENDANCE#{class_id}', 'sk': date}).get('Item', {})
            records = existing.get('records', {})
            records[username] = new_status
            table.put_item(Item={
                'pk': f'ATTENDANCE#{class_id}', 'sk': date,
                'records': records,
                'updatedAt': datetime.now(timezone.utc).isoformat()
            })
            return resp(200, {'message': 'Attendance updated'})
        # Teachers/admins update full records
        table.put_item(Item={
            'pk': f'ATTENDANCE#{class_id}', 'sk': date,
            'records': body.get('records', {}),
            'updatedAt': datetime.now(timezone.utc).isoformat()
        })
        return resp(200, {'message': 'Attendance saved'})

    # ==================== HOMEWORK STATUS ====================

    if method == 'GET' and path.startswith('/prod/admin/classes/') and path.endswith('/hw-status'):
        if get_role(event) not in ('admin', 'teacher'):
            return resp(403, {'error': 'Forbidden'})
        class_id = path.split('/')[4]
        try:
            cls = table.get_item(Key={'pk': 'CLASS', 'sk': class_id}).get('Item', {})
            members = cls.get('members', [])
            course_id = cls.get('courseId', '')
            assignments_result = table.query(KeyConditionExpression=boto3.dynamodb.conditions.Key('pk').eq('ASSIGNMENT'))
            assignments = [a for a in assignments_result.get('Items', []) if a.get('courseId') == course_id]
            overrides_result = table.get_item(Key={'pk': f'HW_STATUS#{class_id}', 'sk': 'overrides'})
            overrides = overrides_result.get('Item', {}).get('data', {})
            status = {}
            for uname in members:
                status[uname] = {}
                for a in assignments:
                    aid = a['sk']
                    sub = table.get_item(Key={'pk': f'SUBMISSION#{aid}', 'sk': uname}).get('Item', {})
                    submitted = sub.get('submitted', False)
                    marked_key = f'{uname}#{aid}'
                    marked_data = overrides.get(marked_key, {})
                    status[uname][aid] = {
                        'title': a.get('title', ''),
                        'submitted': overrides.get(f'{uname}#{aid}#submitted', submitted),
                        'markedFile': marked_data.get('markedFile', ''),
                        'markedFileName': marked_data.get('markedFileName', ''),
                        'marked': bool(marked_data.get('markedFile', ''))
                    }
            return resp(200, {'assignments': [{'sk': a['sk'], 'title': a.get('title','')} for a in assignments], 'status': status})
        except Exception as e:
            return resp(500, {'error': str(e)})

    if method == 'PUT' and path.startswith('/prod/admin/classes/') and path.endswith('/hw-status'):
        if get_role(event) not in ('admin', 'teacher'):
            return resp(403, {'error': 'Forbidden'})
        class_id = path.split('/')[4]
        body = json.loads(event.get('body') or '{}')
        uname = body.get('username')
        aid = body.get('assignmentId')
        if not uname or not aid:
            return resp(400, {'error': 'Missing username or assignmentId'})
        overrides_result = table.get_item(Key={'pk': f'HW_STATUS#{class_id}', 'sk': 'overrides'})
        overrides = overrides_result.get('Item', {}).get('data', {})
        key = f'{uname}#{aid}'
        if key not in overrides:
            overrides[key] = {}
        if 'submitted' in body:
            overrides[f'{uname}#{aid}#submitted'] = body['submitted']
        if 'markedFile' in body:
            overrides[key]['markedFile'] = body['markedFile']
            overrides[key]['markedFileName'] = body.get('markedFileName', '')
        table.put_item(Item={
            'pk': f'HW_STATUS#{class_id}', 'sk': 'overrides',
            'data': overrides,
            'updatedAt': datetime.now(timezone.utc).isoformat()
        })
        return resp(200, {'message': 'Updated'})

    return resp(404, {'error': 'Not found'})