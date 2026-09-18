const fs = require('fs');
const path = require('path');
const { Connection, PublicKey, clusterApiUrl } = require('@solana/web3.js');
const { getMint } = require('@solana/spl-token');

const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
const MINT_ADDRESS = process.env.MINT_ADDRESS || '';

// 配合 Vercel 的 /tmp 暫存區路徑邏輯
const whitelistPath = process.env.VERCEL ? path.join('/tmp', 'whitelist.json') : path.join(process.cwd(), 'whitelist.json');
const historyPath = process.env.VERCEL ? path.join('/tmp', 'history.json') : path.join(process.cwd(), 'history.json');

function getWhitelist() {
    try {
        let targetPath = whitelistPath;
        if (!fs.existsSync(targetPath)) {
            // 如果 /tmp 裡沒有，嘗試讀取專案根目錄的初始檔案
            const fallbackPath = path.join(process.cwd(), 'whitelist.json');
            if (fs.existsSync(fallbackPath)) {
                return JSON.parse(fs.readFileSync(fallbackPath, 'utf8').replace(/^\uFEFF/, ''));
            }
            return [];
        }
        return JSON.parse(fs.readFileSync(targetPath, 'utf8').replace(/^\uFEFF/, ''));
    } catch (e) { return []; }
}

function getHistory() {
    try {
        let targetPath = historyPath;
        if (!fs.existsSync(targetPath)) {
            const fallbackPath = path.join(process.cwd(), 'history.json');
            if (fs.existsSync(fallbackPath)) {
                return JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
            }
            return {};
        }
        return JSON.parse(fs.readFileSync(targetPath, 'utf8'));
    } catch (e) { return {}; }
}

async function getCurrentSupply() {
    try {
        if (!MINT_ADDRESS) return 1000000000;
        const mintPubkey = new PublicKey(MINT_ADDRESS);
        const mintInfo = await getMint(connection, mintPubkey);
        return Number(mintInfo.supply) / (10 ** mintInfo.decimals);
    } catch (err) {
        return 1000000000;
    }
}

module.exports = async (req, res) => {
    const whitelist = getWhitelist();
    const history = getHistory();

    let totalAirdropCount = 0;
    for (const count of Object.values(history)) {
        totalAirdropCount += count;
    }

    const currentSupply = await getCurrentSupply();

    res.status(200).json({
        whitelistCount: whitelist.length,
        totalAirdropCount: totalAirdropCount,
        currentSupply: currentSupply,
        mintAddress: MINT_ADDRESS
    });
};