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
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS'
}

def resp(status, body):
    return {'statusCode': status, 'headers': HEADERS, 'body': json.dumps(body)}

def get_role(event):
    try:
        claims = event['requestContext']['authorizer']['jwt']['claims']
        groups = claims.get('cognito:groups', '')
        if 'admins' in groups:
            return 'admin'
        if 'teachers' in groups:
            return 'teacher'
            return 'teacher'
        if 'students' in groups:
            return 'student'
        return None
    except:
        return None

def lambda_handler(event, context):
    method = event['requestContext']['http']['method']
    path = event['requestContext']['http']['path']
    table = dynamodb.Table(TABLE)

    if method == 'OPTIONS':
        return resp(200, {})

    # POST /users — create student (teacher only)
    if method == 'POST' and path == '/prod/users':
        if get_role(event) != 'teacher':
            return resp(403, {'error': 'Forbidden'})
        body = json.loads(event.get('body') or '{}')
        username, password, email = body.get('username'), body.get('password'), body.get('email')
        if not all([username, password, email]):
            return resp(400, {'error': 'Missing fields'})
        try:
            cognito.admin_create_user(
                UserPoolId=USER_POOL_ID,
                Username=username,
                TemporaryPassword=password,
                MessageAction='SUPPRESS',
                UserAttributes=[
                    {'Name': 'email', 'Value': email},
                    {'Name': 'email_verified', 'Value': 'true'},
                    {'Name': 'custom:role', 'Value': 'student'}
                ]
            )
            cognito.admin_set_user_password(
                UserPoolId=USER_POOL_ID,
                Username=username,
                Password=password,
                Permanent=True
            )
            cognito.admin_add_user_to_group(
                UserPoolId=USER_POOL_ID,
                Username=username,
                GroupName='students'
            )
            return resp(200, {'message': 'Student created'})
        except Exception as e:
            return resp(500, {'error': str(e)})

    # GET /users — list students (teacher only)
    if method == 'GET' and path == '/prod/users':
        if get_role(event) != 'teacher':
            return resp(403, {'error': 'Forbidden'})
        try:
            result = cognito.list_users(UserPoolId=USER_POOL_ID)
            students = []
            for u in result['Users']:
                attrs = {a['Name']: a['Value'] for a in u['Attributes']}
                if attrs.get('custom:role') == 'student':
                    students.append({'username': u['Username'], 'email': attrs.get('email')})
            return resp(200, students)
        except Exception as e:
            return resp(500, {'error': str(e)})

    # POST /assignments — create assignment (teacher only)
    if method == 'POST' and path == '/prod/assignments':
        if get_role(event) != 'teacher':
            return resp(403, {'error': 'Forbidden'})
        body = json.loads(event.get('body') or '{}')
        if not body.get('title'):
            return resp(400, {'error': 'Missing title'})
        item_id = str(int(datetime.now(timezone.utc).timestamp() * 1000))
        table.put_item(Item={
            'pk': 'ASSIGNMENT', 'sk': item_id,
            'title': body['title'],
            'description': body.get('description', ''),
            'dueDate': body.get('dueDate', ''),
            'assignedTo': body.get('assignedTo', 'all'),
            'createdAt': datetime.now(timezone.utc).isoformat()
        })
        return resp(200, {'message': 'Assignment created', 'id': item_id})

    # GET /assignments
    if method == 'GET' and path == '/prod/assignments':
        result = table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key('pk').eq('ASSIGNMENT')
        )
        return resp(200, result['Items'])

    # DELETE /assignments/{id} (teacher only)
    if method == 'DELETE' and path.startswith('/prod/assignments/'):
        if get_role(event) != 'teacher':
            return resp(403, {'error': 'Forbidden'})
        item_id = path.split('/')[-1]
        table.delete_item(Key={'pk': 'ASSIGNMENT', 'sk': item_id})
        return resp(200, {'message': 'Deleted'})

    # POST /handouts — create handout (teacher only)
    if method == 'POST' and path == '/prod/handouts':
        if get_role(event) not in ('teacher', 'admin'):
            return resp(403, {'error': 'Forbidden'})
        body = json.loads(event.get('body') or '{}')
        if not body.get('title'):
            return resp(400, {'error': 'Missing title'})
        item_id = str(int(datetime.now(timezone.utc).timestamp() * 1000))
        table.put_item(Item={
            'pk': 'HANDOUT', 'sk': item_id,
            'title': body['title'],
            'url': body.get('url', ''),
            'description': body.get('description', ''),
            'content': body.get('content', ''),
            'courseId': body.get('courseId', ''),
            'createdAt': datetime.now(timezone.utc).isoformat()
        })
        return resp(200, {'message': 'Handout created', 'id': item_id})

    # GET /handouts
    if method == 'GET' and path == '/prod/handouts':
        result = table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key('pk').eq('HANDOUT')
        )
        return resp(200, result['Items'])

    # PUT /handouts/{id} — update handout (teacher/admin only)
    if method == 'PUT' and path.startswith('/prod/handouts/'):
        if get_role(event) not in ('teacher', 'admin'):
            return resp(403, {'error': 'Forbidden'})
        item_id = path.split('/')[-1]
        body = json.loads(event.get('body') or '{}')
        if not body.get('title'):
            return resp(400, {'error': 'Missing title'})
        table.put_item(Item={
            'pk': 'HANDOUT', 'sk': item_id,
            'title': body['title'],
            'url': body.get('url', ''),
            'description': body.get('description', ''),
            'content': body.get('content', ''),
            'courseId': body.get('courseId', ''),
            'updatedAt': datetime.now(timezone.utc).isoformat()
        })
        return resp(200, {'message': 'Handout updated'})

    # DELETE /handouts/{id} (teacher/admin only)
    if method == 'DELETE' and path.startswith('/prod/handouts/'):
        if get_role(event) not in ('teacher', 'admin'):
            return resp(403, {'error': 'Forbidden'})
        item_id = path.split('/')[-1]
        table.delete_item(Key={'pk': 'HANDOUT', 'sk': item_id})
        return resp(200, {'message': 'Deleted'})
        return resp(200, {'message': 'Deleted'})

    # POST /upload-url — get presigned S3 upload URL (teacher/admin only)
    if method == 'POST' and path == '/prod/upload-url':
        if get_role(event) not in ('teacher', 'admin'):
            return resp(403, {'error': 'Forbidden'})
        body = json.loads(event.get('body') or '{}')
        filename = body.get('filename', 'file')
        content_type = body.get('contentType', 'application/octet-stream')
        key = f"uploads/{uuid.uuid4()}-{filename}"
        try:
            url = s3.generate_presigned_url('put_object',
                Params={'Bucket': S3_BUCKET, 'Key': key, 'ContentType': content_type},
                ExpiresIn=300
            )
            public_url = f"https://{S3_BUCKET}/{key}"
            return resp(200, {'uploadUrl': url, 'publicUrl': public_url, 'key': key})
        except Exception as e:
            return resp(500, {'error': str(e)})

    # GET /announcements
    if method == 'GET' and path == '/prod/announcements':
        try:
            claims = event['requestContext']['authorizer']['jwt']['claims']
            username = claims.get('cognito:username')
            result = table.query(
                KeyConditionExpression=boto3.dynamodb.conditions.Key('pk').eq('ANNOUNCEMENT')
            )
            items = result.get('Items', [])
            # Filter to announcements assigned to this user or 'all'
            visible = [a for a in items if a.get('assignedTo') == 'all' or username in (a.get('assignedTo') or [])]
            return resp(200, visible)
        except Exception as e:
            return resp(500, {'error': str(e)})

    # POST /announcements — create (teacher/admin only)
    if method == 'POST' and path == '/prod/announcements':
        if get_role(event) not in ('teacher', 'admin'):
            return resp(403, {'error': 'Forbidden'})
        body = json.loads(event.get('body') or '{}')
        if not body.get('title'):
            return resp(400, {'error': 'Missing title'})
        item_id = str(int(datetime.now(timezone.utc).timestamp() * 1000))
        table.put_item(Item={
            'pk': 'ANNOUNCEMENT', 'sk': item_id,
            'title': body['title'],
            'message': body.get('message', ''),
            'assignedTo': body.get('assignedTo', 'all'),
            'createdAt': datetime.now(timezone.utc).isoformat()
        })
        return resp(200, {'message': 'Announcement created', 'id': item_id})

    # DELETE /announcements/{id} (teacher/admin only)
    if method == 'DELETE' and path.startswith('/prod/announcements/'):
        if get_role(event) not in ('teacher', 'admin'):
            return resp(403, {'error': 'Forbidden'})
        item_id = path.split('/')[-1]
        table.delete_item(Key={'pk': 'ANNOUNCEMENT', 'sk': item_id})
        return resp(200, {'message': 'Deleted'})

    # GET /profile — get current user's profile
    if method == 'GET' and path == '/prod/profile':
        try:
            claims = event['requestContext']['authorizer']['jwt']['claims']
            username = claims.get('cognito:username')
            result = table.get_item(Key={'pk': 'PROFILE', 'sk': username})
            return resp(200, result.get('Item', {}))
        except Exception as e:
            return resp(500, {'error': str(e)})

    # POST /profile — save current user's profile
    if method == 'POST' and path == '/prod/profile':
        try:
            claims = event['requestContext']['authorizer']['jwt']['claims']
            username = claims.get('cognito:username')
            body = json.loads(event.get('body') or '{}')
            if not body.get('firstName') or not body.get('lastName') or not body.get('dob'):
                return resp(400, {'error': 'Missing fields'})
            table.put_item(Item={
                'pk': 'PROFILE', 'sk': username,
                'firstName': body['firstName'],
                'lastName': body['lastName'],
                'dob': body['dob'],
                'updatedAt': datetime.now(timezone.utc).isoformat()
            })
            return resp(200, {'message': 'Profile saved'})
        except Exception as e:
            return resp(500, {'error': str(e)})

    # GET /admin/users — list all users (admin only)
    if method == 'GET' and path == '/prod/admin/users':
        if get_role(event) not in ('admin',):
            return resp(403, {'error': 'Forbidden'})
        try:
            result = cognito.list_users(UserPoolId=USER_POOL_ID)
            users = []
            for u in result['Users']:
                attrs = {a['Name']: a['Value'] for a in u['Attributes']}
                groups_res = cognito.admin_list_groups_for_user(UserPoolId=USER_POOL_ID, Username=u['Username'])
                user_groups = [g['GroupName'] for g in groups_res['Groups']]
                users.append({
                    'username': u['Username'],
                    'email': attrs.get('email', ''),
                    'status': u['UserStatus'],
                    'groups': user_groups
                })
            return resp(200, users)
        except Exception as e:
            return resp(500, {'error': str(e)})

    # GET /admin/classes — list all classes (admin only)
    if method == 'GET' and path == '/prod/admin/classes':
        if get_role(event) != 'admin':
            return resp(403, {'error': 'Forbidden'})
        result = table.query(KeyConditionExpression=boto3.dynamodb.conditions.Key('pk').eq('CLASS'))
        return resp(200, result.get('Items', []))

    # POST /admin/classes — create a class (admin only)
    if method == 'POST' and path == '/prod/admin/classes':
        if get_role(event) != 'admin':
            return resp(403, {'error': 'Forbidden'})
        body = json.loads(event.get('body') or '{}')
        if not body.get('name'):
            return resp(400, {'error': 'Missing class name'})
        class_id = str(int(datetime.now(timezone.utc).timestamp() * 1000))
        table.put_item(Item={
            'pk': 'CLASS', 'sk': class_id,
            'name': body['name'],
            'members': [],
            'createdAt': datetime.now(timezone.utc).isoformat()
        })
        return resp(200, {'message': 'Class created', 'id': class_id})

    # POST /admin/classes/{id}/members — add user to class (admin only)
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
        table.update_item(
            Key={'pk': 'CLASS', 'sk': class_id},
            UpdateExpression='SET members = :m',
            ExpressionAttributeValues={':m': members}
        )
        return resp(200, {'message': 'Member added'})

    # DELETE /admin/classes/{id} — delete class (admin only)
    if method == 'DELETE' and path.startswith('/prod/admin/classes/'):
        if get_role(event) != 'admin':
            return resp(403, {'error': 'Forbidden'})
        class_id = path.split('/')[-1]
        table.delete_item(Key={'pk': 'CLASS', 'sk': class_id})
        return resp(200, {'message': 'Deleted'})

    return resp(404, {'error': 'Not found'})