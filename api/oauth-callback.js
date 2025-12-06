/**
 * OAuth Callback Handler for Vercel
 * 
 * This serverless function receives the OAuth callback from Intuit
 * and displays the full redirect URL that you can copy and paste
 * into your local auth script.
 */

export default function handler(req, res) {
  const { code, realmId, state, error } = req.query;

  // Handle authorization errors
  if (error) {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>OAuth Error</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              max-width: 800px;
              margin: 50px auto;
              padding: 20px;
              background: #f5f5f5;
            }
            .container {
              background: white;
              padding: 30px;
              border-radius: 8px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .error {
              color: #d32f2f;
              padding: 15px;
              background: #ffebee;
              border-radius: 4px;
              margin: 20px 0;
            }
            h1 { color: #333; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>❌ Authorization Failed</h1>
            <div class="error">
              <strong>Error:</strong> ${error}
            </div>
            <p>Please try the authorization process again.</p>
          </div>
        </body>
      </html>
    `);
  }

  // Successfully received OAuth callback
  if (code && realmId) {
    const fullUrl = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}${req.url}`;
    
    return res.status(200).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>OAuth Success</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              max-width: 800px;
              margin: 50px auto;
              padding: 20px;
              background: #f5f5f5;
            }
            .container {
              background: white;
              padding: 30px;
              border-radius: 8px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .success {
              color: #2e7d32;
              padding: 15px;
              background: #e8f5e9;
              border-radius: 4px;
              margin: 20px 0;
            }
            .url-box {
              background: #f5f5f5;
              padding: 15px;
              border-radius: 4px;
              font-family: 'Courier New', monospace;
              word-break: break-all;
              margin: 20px 0;
              border: 2px solid #4caf50;
            }
            .copy-button {
              background: #2196f3;
              color: white;
              border: none;
              padding: 10px 20px;
              border-radius: 4px;
              cursor: pointer;
              font-size: 14px;
              margin-top: 10px;
            }
            .copy-button:hover {
              background: #1976d2;
            }
            .copy-button:active {
              background: #0d47a1;
            }
            .copied {
              background: #4caf50;
            }
            h1 { color: #333; }
            .params {
              margin: 20px 0;
              padding: 15px;
              background: #f9f9f9;
              border-radius: 4px;
            }
            .param {
              margin: 8px 0;
              font-family: 'Courier New', monospace;
            }
            .param strong {
              display: inline-block;
              width: 120px;
              color: #555;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>✅ Authorization Successful!</h1>
            
            <div class="success">
              <strong>Success!</strong> QuickBooks has authorized your application.
            </div>

            <h2>Copy this URL:</h2>
            <div class="url-box" id="urlBox">${fullUrl}</div>
            <button class="copy-button" onclick="copyUrl()">📋 Copy URL to Clipboard</button>

            <h2>Extracted Parameters:</h2>
            <div class="params">
              <div class="param"><strong>Code:</strong> ${code}</div>
              <div class="param"><strong>Realm ID:</strong> ${realmId}</div>
              ${state ? `<div class="param"><strong>State:</strong> ${state}</div>` : ''}
            </div>

            <h2>Next Steps:</h2>
            <ol>
              <li>Copy the URL above using the button</li>
              <li>Paste it into your terminal where the auth script is waiting</li>
              <li>Press Enter to complete the authentication process</li>
            </ol>
          </div>

          <script>
            function copyUrl() {
              const urlBox = document.getElementById('urlBox');
              const text = urlBox.textContent;
              
              navigator.clipboard.writeText(text).then(function() {
                const button = document.querySelector('.copy-button');
                button.textContent = '✓ Copied!';
                button.classList.add('copied');
                
                setTimeout(function() {
                  button.textContent = '📋 Copy URL to Clipboard';
                  button.classList.remove('copied');
                }, 2000);
              }, function(err) {
                alert('Failed to copy: ' + err);
              });
            }
          </script>
        </body>
      </html>
    `);
  }

  // No parameters received
  return res.status(400).send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Invalid Request</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
            background: #f5f5f5;
          }
          .container {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          h1 { color: #333; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>⚠️ Invalid Request</h1>
          <p>This endpoint expects OAuth callback parameters from Intuit.</p>
          <p>Please use the proper OAuth authorization flow.</p>
        </div>
      </body>
    </html>
  `);
}

