import { pool } from './src/lib/db';

async function run() {
    const connection = await pool.getConnection();
    try {
        const [fvu] = await connection.query("DESCRIBE fvu_logs");
        console.log("fvu_logs:", fvu);
    } finally {
        connection.release();
    }
    process.exit(0);
}
run();
