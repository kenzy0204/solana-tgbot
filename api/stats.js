const { neon } = require('@neondatabase/serverless');
const { Connection, PublicKey, clusterApiUrl } = require('@solana/web3.js');
const { getMint } = require('@solana/spl-token');

const sql = neon(process.env.POSTGRES_URL);

const connection = new Connection(
    clusterApiUrl('devnet'),
    'confirmed'
);

const MINT_ADDRESS = process.env.MINT_ADDRESS || '';

async function getWhitelistCount() {
    try {
        const rows = await sql`
            SELECT COUNT(*)::int AS count
            FROM whitelist
        `;

        return rows[0]?.count || 0;
    } catch (error) {
        console.error(
            '❌ 讀取白名單數量失敗：',
            error.message
        );

        return 0;
    }
}

async function getTotalAirdropCount() {
    try {
        const rows = await sql`
            SELECT COALESCE(SUM(count), 0)::int AS total
            FROM airdrop_history
        `;

        return rows[0]?.total || 0;
    } catch (error) {
        console.error(
            '❌ 讀取空投次數失敗：',
            error.message
        );

        return 0;
    }
}

async function getCurrentSupply() {
    try {
        if (!MINT_ADDRESS) {
            return 1000000000;
        }

        const mintPubkey = new PublicKey(MINT_ADDRESS);

        const mintInfo = await getMint(
            connection,
            mintPubkey
        );

        return Number(mintInfo.supply) /
            (10 ** mintInfo.decimals);

    } catch (error) {
        console.error(
            '❌ 讀取代幣供應量失敗：',
            error.message
        );

        return 1000000000;
    }
}

module.exports = async (req, res) => {
    try {
        const whitelistCount = await getWhitelistCount();
        const totalAirdropCount = await getTotalAirdropCount();
        const currentSupply = await getCurrentSupply();

        res.status(200).json({
            whitelistCount,
            totalAirdropCount,
            currentSupply,
            mintAddress: MINT_ADDRESS
        });

    } catch (error) {
        console.error(
            '❌ stats API 發生錯誤：',
            error.message
        );

        res.status(500).json({
            error: '無法取得即時統計資料'
        });
    }
};