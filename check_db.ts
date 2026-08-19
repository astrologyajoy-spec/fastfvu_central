import { pool } from './src/lib/db';

async function run() {
    const connection = await pool.getConnection();
    try {
        const [tables] = await connection.query("SHOW TABLES");
        console.log("Tables:", tables);
    } finally {
        connection.release();
    }
    process.exit(0);
}
run();
