const fs = require('fs');
const path = require('path');
const { Connection, PublicKey, clusterApiUrl } = require('@solana/web3.js');
const { getMint } = require('@solana/spl-token');

const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
const MINT_ADDRESS = process.env.MINT_ADDRESS || '';

function getWhitelist() {
    try {
        const filePath = path.join(process.cwd(), 'whitelist.json');
        if (!fs.existsSync(filePath)) return [];
        return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
    } catch (e) { return []; }
}

function getHistory() {
    try {
        const filePath = path.join(process.cwd(), 'history.json');
        if (!fs.existsSync(filePath)) return {};
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
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