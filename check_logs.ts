import { pool } from './src/lib/db';

async function run() {
    const connection = await pool.getConnection();
    try {
        const [logs] = await connection.query("SELECT * FROM fvu_logs");
        console.log("fvu_logs:", logs);
    } finally {
        connection.release();
    }
    process.exit(0);
}
run();
