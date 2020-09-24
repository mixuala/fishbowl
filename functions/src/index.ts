/**
 * A quick TypeScript implementation of the Zoom JWT generate signature() method with `firebase cloud functions`. see:
 *    - https://marketplace.zoom.us/docs/sdk/native-sdks/web/essential/signature
 *    - https://firebase.google.com/docs/functions
 *    - https://firebase.google.com/docs/functions/typescript
 * 
 * Configuration Notes
 * 
 * for Zoom JWT Credentials: 
 *    for apiKey/apiSecret, see: https://marketplace.zoom.us/develop/create
 * install firebase cloud functions dependencies:
      ```
      // from firebase tools CLI
      cd ./functions
      npm install --save express cors
      ```
 * save Zoom JWT apiKey/Secret to firebase functions as environment vars
      ```
      // from firebase tools CLI
      firebase functions:config:set zoom.apikey="[apiKey]"
      firebase functions:config:set zoom.apisecret="[apiSecret]"
      ```
 * get the cloud function endpoint from the project page in the firebase console: 
 *    e.g. https://console.firebase.google.com/u/0/project/[project name]/functions/list
 *    (ends in "zoomSig")
 * 
 * test: 
      curl --location --request POST 'https://[firebase-cloud-functions-server]/zoomSig' \
      --header 'Content-Type: application/json' \
      --data-raw '{"meetingNumber": [123456789], "role": 0}'
 *      
 */


import * as functions from 'firebase-functions';
const cors = require('cors')
const express = require('express');
const app = express();


// // Start writing Firebase Functions
// // https://firebase.google.com/docs/functions/typescript

const crypto = require('crypto') // crypto comes with Node.js
const apiKey = functions.config().zoom.apikey;
const apiSecret = functions.config().zoom.apisecret;
const zoom_GenerateSignature = (meetingNumber:number, role:number):string => {
  // Prevent time sync issue between client signature generation and zoom 
  const timestamp = new Date().getTime() - 30000
  const msg = Buffer.from(apiKey + meetingNumber + timestamp + role).toString('base64')
  const hash = crypto.createHmac('sha256', apiSecret).update(msg).digest('base64')
  const signature = Buffer.from(`${apiKey}.${meetingNumber}.${timestamp}.${role}.${hash}`).toString('base64')
  return signature
}

app.use(cors({ origin: true }));
app.post('/', (request:any, response:any) => {
  const {meetingNumber, role} = request.body;
  // console.log( "zoomSig:", meetingNumber, role , "\nrequest.body=", request.body, "\nrequest", request)
  if (!meetingNumber || typeof role !== "number") {
    response.status(400).send({ message: 'missing meetingNumber or role' });
    return 
  }
  const signature:string = zoom_GenerateSignature( meetingNumber, role );
  response.send({signature});
});

// // Expose Express API as a single Cloud Function:
export const zoomSig = functions.https.onRequest(app);








/**
 * this method works from `curl`, but does NOT work with correctly with CORS. don't know why.
 */
export const zoomSigWithoutExpress = functions.https.onRequest((request, response) => {
  if(request.method !== "POST"){
    response.status(400).send({ message: 'Please send a POST request'});
    return;
  }
  // cors is NOT working in this example
  cors({ origin: true })(request, response, () => {
    const {meetingNumber, role} = request.body;
    console.log( "zoomSig:", meetingNumber, role , "\nrequest.body=", JSON.stringify(request.body), "\nrequest", request)
    if (!meetingNumber || typeof role !== "number") {
      response.status(400).send({ message: 'missing meetingNumber or role' });
      return 
    }
    const signature:string = zoom_GenerateSignature( meetingNumber, role );
    response.send({signature});
  });
}); 


export const serverTime = functions.https.onRequest((req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).send(`${req.method} method not allowed`);
  }
  const now = Date.now();
  return res.send( {serverTime:now} );
});
