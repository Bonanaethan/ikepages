import json
import boto3
from datetime import datetime, timezone

dynamodb = boto3.resource('dynamodb')
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
        if 'teachers' in groups:
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
        if get_role(event) != 'teacher':
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
            'createdAt': datetime.now(timezone.utc).isoformat()
        })
        return resp(200, {'message': 'Handout created', 'id': item_id})

    # GET /handouts
    if method == 'GET' and path == '/prod/handouts':
        result = table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key('pk').eq('HANDOUT')
        )
        return resp(200, result['Items'])

    # DELETE /handouts/{id} (teacher only)
    if method == 'DELETE' and path.startswith('/prod/handouts/'):
        if get_role(event) != 'teacher':
            return resp(403, {'error': 'Forbidden'})
        item_id = path.split('/')[-1]
        table.delete_item(Key={'pk': 'HANDOUT', 'sk': item_id})
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

    return resp(404, {'error': 'Not found'})