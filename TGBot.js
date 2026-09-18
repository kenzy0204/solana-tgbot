require('@dotenvx/dotenvx').config({ path: 'password.env' }); 

const { Telegraf, Markup } = require('telegraf');
const { Connection, Keypair, PublicKey, clusterApiUrl } = require('@solana/web3.js');
const { getOrCreateAssociatedTokenAccount, transfer } = require('@solana/spl-token');
const bs58 = require('bs58'); 
const fs = require('fs');

const handleBurn = require('./burn'); 

const TG_TOKEN = process.env.TG_TOKEN;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const MINT_ADDRESS = process.env.MINT_ADDRESS;
const ADMIN_ID = parseInt(process.env.ADMIN_ID || '0'); 

if (!TG_TOKEN || !PRIVATE_KEY || !MINT_ADDRESS || !process.env.ADMIN_ID) {
    console.log("\n==================================================");
    console.log("❌ 驗證失敗：程式【沒有】抓到你的秘密檔案！");
    console.log("==================================================\n");
    process.exit(1); 
}

const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
const fromWallet = Keypair.fromSecretKey(bs58.decode(PRIVATE_KEY));
const bot = new Telegraf(TG_TOKEN);

const userStates = {};

function getWhitelist() {
    try {
        if (!fs.existsSync('./whitelist.json')) return [];
        return JSON.parse(fs.readFileSync('./whitelist.json', 'utf8').replace(/^\uFEFF/, ''));
    } catch (e) { return []; }
}

function getHistory() {
    try {
        if (!fs.existsSync('./history.json')) return {};
        return JSON.parse(fs.readFileSync('./history.json', 'utf8'));
    } catch (e) { return {}; }
}

bot.command('myid', (ctx) => {
    ctx.reply(`🆔 您的 Telegram ID 是：${ctx.from.id}`);
});

bot.command(['start', 'menu'], (ctx) => {
    delete userStates[ctx.from.id];
    ctx.reply('👋 歡迎使用 Solana 專題空投與代幣管理機器人！\n請點擊下方按鈕開始操作：', 
        Markup.keyboard([
            ['📌 基本介紹', '🎁 領取空投'],
            ['📊 實時監控數據', '🏫 關於我們']
        ]).resize()
    );
});

bot.hears('📌 基本介紹', (ctx) => {
    delete userStates[ctx.from.id];
    const introText = `🤖 【專題技術架構介紹】\n\n` +
        `1️⃣ 核心後端：Node.js\n` +
        `2️⃣ 機器人框架：Telegraf (Telegram Bot API)\n` +
        `3️⃣ 部署架構：Vercel Serverless (雲端無伺服器)\n` +
        `4️⃣ 區塊鏈互動：@solana/web3.js & @solana/spl-token (Devnet 測試網)\n` +
        `5️⃣ 安全管理：@dotenvx/dotenvx (環境變數加密隔離)\n` +
        `6️⃣ 資料儲存：JSON 檔案型資料庫 (記錄白名單與領取次數)`;
    ctx.reply(introText);
});

bot.hears('🎁 領取空投', (ctx) => {
    userStates[ctx.from.id] = 'airdrop';
    ctx.reply('🎁 【領取空投模式】\n\n👉 請直接在下方「貼上您的 Solana 錢包地址」即可自動領取！');
});

// 📊 實時監控數據（改為抓取 Vercel 自己的 API）
bot.hears('📊 實時監控數據', async (ctx) => {
    delete userStates[ctx.from.id];
    
    try {
        // 透過相對路徑或伺服器本身獲取 stats
        const response = await fetch('https://' + ctx.telegram.toString() + '/api/stats'); // 確保雲端可訪問
        // 如果是在 Vercel 上，也可以直接打相對路徑，這裡維持穩定呼叫
        const statsData = {
            mintAddress: MINT_ADDRESS,
            whitelistCount: getWhitelist().length,
            totalAirdropCount: Object.values(getHistory()).reduce((a, b) => a + b, 0),
            currentSupply: 1000000000 // 或由鏈上動態計算
        };

        const statsText = `📊 【專題代幣即時監控儀表板】\n\n` +
            `🌐 區塊鏈網路：Solana Devnet (測試網)\n` +
            `🪙 代幣合約地址：\n\`${MINT_ADDRESS}\`\n\n` +
            `👥 白名單總人數：${getWhitelist().length} 人\n` +
            `🎁 總空投發放次數：${Object.values(getHistory()).reduce((a, b) => a + b, 0)} 次\n` +
            `💻 狀態：🟢 Vercel 雲端服務運行中`;
        
        ctx.reply(statsText, { parse_mode: 'Markdown' });
    } catch (err) {
        console.error('❌ 取得數據失敗：', err.message);
        ctx.reply('⚠️ 目前無法取得即時數據。');
    }
});

bot.hears('🏫 關於我們', (ctx) => {
    delete userStates[ctx.from.id];
    ctx.reply('🏫 點擊下方連結造訪正修科技大學資工系首頁：', 
        Markup.inlineKeyboard([
            [Markup.button.url('🔗 前往正修資工系官網', 'https://csie.csu.edu.tw/')]
        ])
    );
});

bot.on('text', async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) return;

    const isSolanaAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text);
    if (!isSolanaAddress) return;

    const userId = ctx.from.id;
    const currentMode = userStates[userId];

    if (!currentMode || currentMode !== 'airdrop') {
        return ctx.reply('💡 請先點擊下方的【🎁 領取空投】按鈕，然後再貼上地址！');
    }

    const address = text;
    delete userStates[userId];

    console.log(`[Airdrop] TG用戶(${userId}) 透過貼上地址申請空投 ➡️ 地址: ${address}`);

    let whitelist = getWhitelist();
    const history = getHistory();

    if (!whitelist.includes(address)) {
        whitelist.push(address);
        fs.writeFileSync('./whitelist.json', JSON.stringify(whitelist, null, 2));
        console.log(`[白名單] 成功加入新地址: ${address}`);
        ctx.reply(`✅ 歡迎新成員！已將您的地址加入白名單。`);
    }

    const count = history[address] || 0;
    if (count >= 3) {
        console.log(`⚠️  [攔截] 地址 ${address} 領取額度已滿(3次)，拒絕發送。`);
        return ctx.reply(`🚫 該地址已領取過 3 次，額度已滿！`);
    }

    ctx.reply(`⏳ 正在發送 1,000,000 枚...請稍候`);

    try {
        const mint = new PublicKey(MINT_ADDRESS);
        const to = new PublicKey(address);
        const fromAta = await getOrCreateAssociatedTokenAccount(connection, fromWallet, mint, fromWallet.publicKey);
        const toAta = await getOrCreateAssociatedTokenAccount(connection, fromWallet, mint, to);
        
        const amount = BigInt(1000000) * BigInt(10 ** 9);
        
        const tx = await transfer(connection, fromWallet, fromAta.address, toAta.address, fromWallet.publicKey, amount);
        
        history[address] = count + 1;
        fs.writeFileSync('./history.json', JSON.stringify(history, null, 2));

        console.log(`💰 【空投成功】地址: ${address} | 累計次數: ${history[address]}/3 | TX: ${tx}`);

        ctx.reply(`🎉 領取成功！(已領 ${history[address]}/3 次)\n交易 ID: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
    } catch (err) {
        console.log(`❌ 【空投失敗】目標地址: ${address} | 原因: ${err.message}`);
        ctx.reply(`❌ 失敗原因：${err.message}`);
    }
});

bot.command('burn', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        console.log(`⚠️ 警告：收到非授權用戶 (${ctx.from.id}) 的銷毀指令。`);
        return ctx.reply('⛔ 權限不足！只有項目方管理員可以執行銷毀指令。');
    }
    console.log(`🔥 【銷毀啟動】管理員(${ctx.from.id}) 正在執行代幣銷毀...`);
    handleBurn(ctx, connection, fromWallet, MINT_ADDRESS);
});

// 匯出 bot 實例給 Vercel Webhook 使用
module.exports = bot;