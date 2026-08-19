import { pool } from './src/lib/db';

async function run() {
    const connection = await pool.getConnection();
    try {
        console.log("Dropping tables to apply new schema...");
        await connection.query("DROP TABLE IF EXISTS validation_logs");
        await connection.query("DROP TABLE IF EXISTS fvu_logs");
        await connection.query("DROP TABLE IF EXISTS api_keys");
        await connection.query("DROP TABLE IF EXISTS users");
        console.log("Dropped.");
    } finally {
        connection.release();
    }
    process.exit(0);
}
run();
