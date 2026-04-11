const http = require('http');

const port = Number(process.env.MOCK_DZPATCH_PORT || 4010);

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/quote') {
      const payload = await readJson(req);
      const checkoutReference = payload?.meta?.checkout_reference || `ref-${Date.now()}`;
      const response = {
        quote_id: `quote-${checkoutReference}`,
        currency: 'NGN',
        delivery_fee: 1500,
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        pricing_mode: 'partner_quote',
        pricing_snapshot: {
          source: 'mock-dzpatch',
        },
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
      return;
    }

    if (req.method === 'POST' && req.url === '/partner/deliveries') {
      const payload = await readJson(req);
      const externalOrderId = payload?.external_order_id || `order-${Date.now()}`;
      const response = {
        delivery_id: `delivery-${externalOrderId}`,
        status: 'accepted',
        tracking: {
          tracking_url: `https://mock.dzpatch.local/track/${externalOrderId}`,
        },
        delivery_code: {
          code: '654321',
        },
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }));
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`mock-dzpatch-server listening on http://127.0.0.1:${port}`);
});
