import { pool } from './src/lib/db';

async function run() {
    const connection = await pool.getConnection();
    try {
        console.log("Adding output_filename to fvu_logs...");
        await connection.query("ALTER TABLE fvu_logs ADD COLUMN output_filename VARCHAR(255)");
        console.log("Done.");
    } catch (e: any) {
        console.log("Ignored err:", e.message);
    } finally {
        connection.release();
    }
    process.exit(0);
}
run();
