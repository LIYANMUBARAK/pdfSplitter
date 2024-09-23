import { Request, Response } from 'express'
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import mysql from 'mysql2/promise';
import pool from '../shared/dbConnectionPool';



import 'dotenv/config';



export async function initiateAuth(req: Request, res: Response) {
    try {
      const authUrl = `https://marketplace.gohighlevel.com/oauth/chooselocation?response_type=code&redirect_uri=${process.env.REDIRECT_URL}&client_id=${process.env.CLIENT_ID}&scope=conversations.readonly conversations.write conversations/message.readonly conversations/message.write conversations/reports.readonly contacts.readonly contacts.write lc-email.readonly locations.readonly locations/customValues.readonly locations/customValues.write locations/customFields.readonly locations/customFields.write medias.readonly medias.write users.readonly`;
      res.redirect(authUrl)  //get token from url params
    } catch (error) {
      console.log("Auth initiation failed.Error:" + error)
    }
  }

  export async function captureCode(req:Request,res:Response) {
    try {
        const code = req.query.code as string; // Get the code from the query parameters

        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                 <link href="https://dashboard.kashcallerai.com/static/css/bootstrap5.css" rel="stylesheet">
    <link href="https://dashboard.kashcallerai.com/static/css/select2.min.css" rel="stylesheet">
                <title>Access Code</title>
            </head>
            <body>
            <div class="text-center mt-5">
                <h1>Access Code</h1>
                <p id="code" class="text-muted">${code}</p>
                <button id="copyButton" class="btn btn-success mt-3">Copy Code</button>
                </div>
                <script>
                    document.getElementById('copyButton').addEventListener('click', () => {
                        const code = document.getElementById('code').innerText;
                        navigator.clipboard.writeText(code).then(() => {
                            alert('Code copied to clipboard!');
                        }).catch(err => {
                            console.error('Failed to copy code: ', err);
                        });
                    });
                </script>
            </body>
            </html>
        `);



    } catch (error) {
        console.log("Error:",error)
    }
  }

  export async function getAccessToken(req:Request,res:Response) {
    try {
        // Serve the HTML form

    res.sendFile(path.join(__dirname, '../html', 'index.html'));



    } catch (error) {
        console.log("Error:",error)
    }
  }



  export async function formSubmission(req: Request, res: Response) {
    try {
        const { locationId, accessCode } = req.body;
        const connection = await pool.getConnection();

        // Check if the location exists in the database
        const [rows]: any[] = await connection.execute(
            'SELECT COUNT(*) AS count FROM api_keys_data WHERE ghl_location_id = ?',
            [locationId]
        );

        const count = rows[0].count;

        if (count > 0) {
            // Location exists, fetch the existing token
            const validAccessToken = await fetchAuthTokenForLocation(locationId);

            // If the above function doesn't throw an error, we have a valid access token
            console.log(`Valid access token for location ${locationId}: ${validAccessToken}`);
             // Read the success HTML file
          const successHtml = fs.readFileSync(path.join(__dirname, '../html', 'accessTokenFetchSuccess.html'), 'utf-8');
          
          // Replace placeholders with actual data
          const responseHtml = successHtml
              .replace('{{locationId}}', locationId)
              .replace('{{accessToken}}', validAccessToken);

          res.send(responseHtml);
        } else {
            // Location doesn't exist, create a new OAuth token
            const encodedParams = new URLSearchParams();
            encodedParams.set('client_id', process.env.CLIENT_ID as string);
            encodedParams.set('client_secret', process.env.CLIENT_SECRET as string);
            encodedParams.set('grant_type', 'authorization_code');
            encodedParams.set('code', accessCode);
            encodedParams.set('redirect_uri', "http://localhost:3000/capturecode/");

            const options = {
                method: 'POST',
                url: 'https://services.leadconnectorhq.com/oauth/token',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Accept: 'application/json'
                },
                data: encodedParams.toString(),
            };

            const { data } = await axios.request(options);
            console.log(data);

            const currentTimestamp = Math.floor(Date.now() / 1000);
            const ghlTokenExpirationTime = currentTimestamp + data.expires_in;

            // Insert the new location and tokens into the database
            const insertSql = `
                INSERT INTO api_keys_data (ghl_location_id, ghl_oauth_token, ghl_refresh_token, ghl_oauth_token_expires_on)
                VALUES (?, ?, ?, ?);
            `;
            const insertValues = [
                locationId,
                data.access_token,
                data.refresh_token,
                ghlTokenExpirationTime
            ];

            await connection.execute(insertSql, insertValues);
            const successHtml = fs.readFileSync(path.join(__dirname, '../html', 'accessTokenFetchSuccess.html'), 'utf-8');
          
            // Replace placeholders with actual data
            const responseHtml = successHtml
                .replace('{{locationId}}', locationId)

            res.send(responseHtml);
        }

        // Close the connection
        connection.release();
    } catch (error) {
        console.error("Error:", error);
        res.status(500).send('An error occurred');
    }
}



export async function fetchAuthTokenForLocation(locationId: string): Promise<string> {
  const connection = await pool.getConnection();

  try {
      const [rows]: any[] = await connection.execute(
          'SELECT ghl_oauth_token, ghl_refresh_token, ghl_oauth_token_expires_on FROM api_keys_data WHERE ghl_location_id = ?',
          [locationId]
      );

      if (rows.length === 0) {
          throw new Error(`No token found for locationId: ${locationId}`);
      }

      const { ghl_oauth_token, ghl_refresh_token, ghl_oauth_token_expires_on } = rows[0];
      const currentTimestamp = Math.floor(Date.now() / 1000);

      if (ghl_oauth_token_expires_on > currentTimestamp) {
          console.log('Token is still valid. Returning existing token.');
          return ghl_oauth_token;
      }

      console.log('Token has expired. Refreshing token...');
      const encodedParams = new URLSearchParams();
      encodedParams.set('client_id', process.env.CLIENT_ID as string);
      encodedParams.set('client_secret', process.env.CLIENT_SECRET as string);
      encodedParams.set('grant_type', 'refresh_token');
      encodedParams.set('refresh_token', ghl_refresh_token);

      const options = {
          method: 'POST',
          url: 'https://services.leadconnectorhq.com/oauth/token',
          headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Accept: 'application/json'
          },
          data: encodedParams.toString(),
      };

      const { data } = await axios.request(options);
      const newExpirationTime = currentTimestamp + data.expires_in;

      await connection.execute(
          'UPDATE api_keys_data SET ghl_oauth_token = ?, ghl_refresh_token = ?, ghl_oauth_token_expires_on = ? WHERE ghl_location_id = ?',
          [data.access_token, data.refresh_token, newExpirationTime, locationId]
      );

      console.log('Token refreshed and updated in the database.');
      return data.access_token;

  } catch (error) {
      console.error('Error fetching or refreshing the token:', error);
      throw error;
  } finally {
      connection.release();  // Release the connection back to the pool
  }
}