import express, {  Request, Response } from 'express';
import bodyParser from 'body-parser';
import router from './routes/routes';
import pool from '../src/shared/dbConnectionPool';


const app = express();
const port = process.env.PORT;
// Middleware to parse URL-encoded data
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());


// Middleware to log requests to the database
// app.use(async (req: Request, res: Response, next) => {
//     try {
//         const connection = await pool.getConnection();
//         await connection.execute(
//             `INSERT INTO request_logs (method, url, body, headers, created_at) VALUES (?, ?, ?, ?, NOW())`,
//             [req.method, req.url, JSON.stringify(req.body), JSON.stringify(req.headers)]
//         );
//         connection.release();
//     } catch (error) {
//         console.error('Failed to log request:', error);
//     }
//     next();
// });





app.use('/',router)

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});