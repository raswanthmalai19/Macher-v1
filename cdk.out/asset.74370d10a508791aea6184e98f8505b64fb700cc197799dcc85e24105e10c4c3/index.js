/**
 * Guardian Sync Lambda Handler
 *
 * Provides REST endpoints for guardian-protected user link management.
 * Used by the Android SyncManager to sync local Room DB with DynamoDB.
 *
 * Endpoints (via API Gateway):
 *   POST   /links           - Create a new link (guardian initiates)
 *   PUT    /links/{linkId}  - Complete a link (protected user scans QR)
 *   GET    /links?guardianId=xxx  - List links for a guardian
 *   DELETE /links/{linkId}  - Deactivate a link
 *   POST   /links/sync      - Batch sync from device
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  PutCommand,
  UpdateCommand,
  QueryCommand,
  GetCommand,
} = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.GUARDIAN_LINKS_TABLE || '';

exports.handler = async (event) => {
  const method = event.httpMethod || event.requestContext?.http?.method;
  const path = event.path || event.rawPath || '';

  try {
    if (method === 'POST' && path.endsWith('/sync')) {
      return await handleBatchSync(event);
    }
    if (method === 'POST') {
      return await handleCreateLink(event);
    }
    if (method === 'PUT') {
      return await handleCompleteLink(event);
    }
    if (method === 'GET') {
      return await handleListLinks(event);
    }
    if (method === 'DELETE') {
      return await handleDeactivateLink(event);
    }

    return response(400, { error: 'Unsupported method' });
  } catch (err) {
    console.error('Handler error:', err);
    return response(500, { error: 'Internal server error' });
  }
};

async function handleCreateLink(event) {
  const body = JSON.parse(event.body || '{}');
  const { linkId, guardianId, guardianName, guardianPhone, linkCode } = body;

  if (!linkId || !guardianId || !linkCode) {
    return response(400, { error: 'Missing required fields: linkId, guardianId, linkCode' });
  }

  await ddb.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      linkId,
      guardianId,
      guardianName: guardianName || '',
      guardianPhone: guardianPhone || '',
      linkCode,
      protectedId: '',
      protectedName: '',
      protectedPhone: '',
      relationship: '',
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    ConditionExpression: 'attribute_not_exists(linkId)',
  }));

  return response(201, { linkId, linkCode });
}

async function handleCompleteLink(event) {
  const linkId = extractLinkId(event);
  const body = JSON.parse(event.body || '{}');
  const { protectedId, protectedName, protectedPhone, relationship } = body;

  if (!linkId || !protectedId) {
    return response(400, { error: 'Missing linkId or protectedId' });
  }

  await ddb.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { linkId },
    UpdateExpression: 'SET protectedId = :pid, protectedName = :pname, protectedPhone = :pphone, relationship = :rel, updatedAt = :ts',
    ExpressionAttributeValues: {
      ':pid': protectedId,
      ':pname': protectedName || '',
      ':pphone': protectedPhone || '',
      ':rel': relationship || '',
      ':ts': Date.now(),
    },
  }));

  return response(200, { linkId, status: 'completed' });
}

async function handleListLinks(event) {
  const guardianId = (event.queryStringParameters || {}).guardianId;
  if (!guardianId) {
    return response(400, { error: 'Missing guardianId query parameter' });
  }

  const result = await ddb.send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: 'guardianId-index',
    KeyConditionExpression: 'guardianId = :gid',
    ExpressionAttributeValues: { ':gid': guardianId },
  }));

  return response(200, { links: result.Items || [] });
}

async function handleDeactivateLink(event) {
  const linkId = extractLinkId(event);
  if (!linkId) return response(400, { error: 'Missing linkId' });

  await ddb.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { linkId },
    UpdateExpression: 'SET isActive = :inactive, updatedAt = :ts',
    ExpressionAttributeValues: { ':inactive': false, ':ts': Date.now() },
  }));

  return response(200, { linkId, status: 'deactivated' });
}

async function handleBatchSync(event) {
  const body = JSON.parse(event.body || '{}');
  const { links } = body;

  if (!Array.isArray(links)) {
    return response(400, { error: 'links must be an array' });
  }

  const results = [];
  for (const link of links) {
    try {
      // Check if link exists in DynamoDB
      const existing = await ddb.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { linkId: link.id },
      }));

      if (existing.Item) {
        // Update if local is newer
        if (link.lastSyncAt > (existing.Item.updatedAt || 0)) {
          await ddb.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { linkId: link.id },
            UpdateExpression: 'SET protectedName = :pn, protectedPhone = :pp, relationship = :rel, isActive = :active, updatedAt = :ts',
            ExpressionAttributeValues: {
              ':pn': link.protectedName || '',
              ':pp': link.protectedPhone || '',
              ':rel': link.relationship || '',
              ':active': link.isActive !== false,
              ':ts': Date.now(),
            },
          }));
        }
        results.push({ id: link.id, status: 'synced' });
      } else {
        // Create new
        await ddb.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            linkId: link.id,
            guardianId: link.guardianId,
            guardianName: link.guardianName || '',
            guardianPhone: link.guardianPhone || '',
            protectedId: link.protectedId || '',
            protectedName: link.protectedName || '',
            protectedPhone: link.protectedPhone || '',
            linkCode: link.linkCode,
            relationship: link.relationship || '',
            isActive: link.isActive !== false,
            createdAt: link.createdAt || Date.now(),
            updatedAt: Date.now(),
          },
        }));
        results.push({ id: link.id, status: 'created' });
      }
    } catch (err) {
      results.push({ id: link.id, status: 'error', message: err.message });
    }
  }

  return response(200, { results });
}

function extractLinkId(event) {
  const pathParams = event.pathParameters || {};
  return pathParams.linkId || '';
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(body),
  };
}
