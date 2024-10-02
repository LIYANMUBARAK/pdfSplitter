import express from 'express'
import { captureCode, formSubmission, getAccessToken, initiateAuth } from '../controllers/authController'
import { getPayload, sendEmailWebhook } from '../controllers/pdfController'
const router = express.Router()

router.get('/',getAccessToken)
router.get('/initiateAuth',initiateAuth)        //to initiate the connection and get the auth code
router.get('/capturecode',captureCode)
router.post('/submit',formSubmission)

router.post('/getPayload',getPayload)
router.post('/sendMailUsingWebhook',sendEmailWebhook)

export default router