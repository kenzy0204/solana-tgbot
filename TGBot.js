const { Telegraf, Markup } = require('telegraf');
const {
    Connection,
    Keypair,
    PublicKey,
    clusterApiUrl
} = require('@solana/web3.js');

const {
    getOrCreateAssociatedTokenAccount,
    transfer
} = require('@solana/spl-token');

const bs58 = require('bs58');

const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.POSTGRES_URL);

const handleBurn = require('./burn');

// ========================================
// 環境變數
// ========================================

const TG_TOKEN = process.env.TG_TOKEN;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const MINT_ADDRESS = process.env.MINT_ADDRESS;
const ADMIN_ID = parseInt(process.env.ADMIN_ID || '0');

// ========================================
// 環境變數檢查
// ========================================

if (!TG_TOKEN || !PRIVATE_KEY || !MINT_ADDRESS || !process.env.POSTGRES_URL) {
    console.warn(
        '⚠️ 警告：缺少必要的環境變數（TG_TOKEN, PRIVATE_KEY, MINT_ADDRESS, POSTGRES_URL）'
    );
}

// ========================================
// Solana 設定
// ========================================

const connection = new Connection(
    clusterApiUrl('devnet'),
    'confirmed'
);

const fromWallet = PRIVATE_KEY
    ? Keypair.fromSecretKey(bs58.decode(PRIVATE_KEY))
    : null;

// ========================================
// Telegram Bot
// ========================================

const bot = new Telegraf(
    TG_TOKEN || 'DUMMY_TOKEN'
);

// ========================================
// 使用者狀態
// ========================================

const userStates = {};

// ========================================
// Neon 資料庫：白名單
// ========================================

async function getWhitelist() {
    try {
        const rows = await sql`
            SELECT address
            FROM whitelist
        `;

        return rows.map(row => row.address);

    } catch (error) {
        console.error('❌ 讀取白名單失敗：', error.message);
        return [];
    }
}

// ========================================
// Neon 資料庫：空投紀錄
// ========================================

async function getHistory() {
    try {
        const rows = await sql`
            SELECT address, count
            FROM airdrop_history
        `;

        const history = {};

        for (const row of rows) {
            history[row.address] = Number(row.count);
        }

        return history;

    } catch (error) {
        console.error('❌ 讀取空投紀錄失敗：', error.message);
        return {};
    }
}

// ========================================
// /myid
// ========================================

bot.command('myid', async (ctx) => {
    await ctx.reply(
        `🆔 您的 Telegram ID 是：${ctx.from.id}`
    );
});

// ========================================
// /start /menu
// ========================================

bot.command(['start', 'menu'], async (ctx) => {
    delete userStates[ctx.from.id];

    await ctx.reply(
        '👋 歡迎使用 Solana 專題空投與代幣管理機器人！\n請點擊下方按鈕開始操作：',
        Markup.keyboard([
            ['📌 基本介紹', '🎁 領取空投'],
            ['📊 實時監控數據', '🏫 關於我們']
        ]).resize()
    );
});

// ========================================
// 基本介紹
// ========================================

bot.hears('📌 基本介紹', async (ctx) => {
    delete userStates[ctx.from.id];

    const introText =
        `🤖 【專題技術架構介紹】\n\n` +
        `1️⃣ 核心後端：Node.js\n` +
        `2️⃣ 機器人框架：Telegraf (Telegram Bot API)\n` +
        `3️⃣ 部署架構：Vercel Serverless (雲端無伺服器)\n` +
        `4️⃣ 區塊鏈互動：@solana/web3.js & @solana/spl-token (Devnet 測試網)\n` +
        `5️⃣ 安全管理：Vercel Environment Variables\n` +
        `6️⃣ 資料儲存：Neon PostgreSQL`;

    await ctx.reply(introText);
});

// ========================================
// 領取空投
// ========================================

bot.hears('🎁 領取空投', async (ctx) => {
    userStates[ctx.from.id] = 'airdrop';

    await ctx.reply(
        '🎁 【領取空投模式】\n\n' +
        '👉 請直接在下方「貼上您的 Solana 錢包地址」即可自動領取！'
    );
});

// ========================================
// 實時監控數據
// ========================================

bot.hears('📊 實時監控數據', async (ctx) => {
    delete userStates[ctx.from.id];

    try {
        const whitelist = await getWhitelist();
        const history = await getHistory();

        const totalAirdropCount = Object.values(history)
            .reduce((total, count) => total + Number(count), 0);

        const statsText =
            `📊 【專題代幣即時監控儀表板】\n\n` +
            `🌐 區塊鏈網路：Solana Devnet (測試網)\n` +
            `🪙 代幣合約地址：\n\`${MINT_ADDRESS}\`\n\n` +
            `👥 白名單總人數：${whitelist.length} 人\n` +
            `🎁 總空投發放次數：${totalAirdropCount} 次\n` +
            `💻 狀態：🟢 Vercel 雲端服務運行中`;

        await ctx.reply(
            statsText,
            { parse_mode: 'Markdown' }
        );

    } catch (err) {
        console.error(
            '❌ 取得數據失敗：',
            err.message
        );

        await ctx.reply(
            '⚠️ 目前無法取得即時數據。'
        );
    }
});

// ========================================
// 關於我們
// ========================================

bot.hears('🏫 關於我們', async (ctx) => {
    delete userStates[ctx.from.id];

    await ctx.reply(
        '🏫 點擊下方連結造訪正修科技大學資工系首頁：',
        Markup.inlineKeyboard([
            [
                Markup.button.url(
                    '🔗 前往正修資工系官網',
                    'https://csie.csu.edu.tw/'
                )
            ]
        ])
    );
});

// ========================================
// 收到文字訊息
// ========================================

bot.on('text', async (ctx, next) => {
    const text = ctx.message.text.trim();

    // 指令不處理
    if (text.startsWith('/')) {
    return next();
}
    // 檢查是不是 Solana 地址
    const isSolanaAddress =
        /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text);

    if (!isSolanaAddress) {
        return;
    }

    const userId = ctx.from.id;
    const currentMode = userStates[userId];

    // 必須先進入領取模式
    if (!currentMode || currentMode !== 'airdrop') {
        return ctx.reply(
            '💡 請先點擊下方的【🎁 領取空投】按鈕，然後再貼上地址！'
        );
    }

    const address = text;

    // 清除狀態
    delete userStates[userId];

    console.log(
        `[Airdrop] TG用戶(${userId}) 透過貼上地址申請空投 ➡️ 地址: ${address}`
    );

    try {
        // ========================================
        // 取得目前資料庫資料
        // ========================================

        const whitelist = await getWhitelist();
        const history = await getHistory();

        // ========================================
        // 加入白名單
        // ========================================

        if (!whitelist.includes(address)) {

            await sql`
                INSERT INTO whitelist (address)
                VALUES (${address})
                ON CONFLICT (address) DO NOTHING
            `;

            console.log(
                `[白名單] 成功加入新地址: ${address}`
            );

            await ctx.reply(
                '✅ 歡迎新成員！已將您的地址加入白名單。'
            );
        }

        // ========================================
        // 檢查領取次數
        // ========================================

        const count = Number(history[address] || 0);

        if (count >= 3) {

            console.log(
                `⚠️ [攔截] 地址 ${address} 領取額度已滿(3次)，拒絕發送。`
            );

            return ctx.reply(
                '🚫 該地址已領取過 3 次，額度已滿！'
            );
        }

        await ctx.reply(
            '⏳ 正在發送 1,000,000 枚...請稍候'
        );

        // ========================================
        // Solana 空投
        // ========================================

        const mint = new PublicKey(MINT_ADDRESS);
        const to = new PublicKey(address);

        if (!fromWallet) {
            throw new Error(
                'PRIVATE_KEY 未設定'
            );
        }

        const fromAta =
            await getOrCreateAssociatedTokenAccount(
                connection,
                fromWallet,
                mint,
                fromWallet.publicKey
            );

        const toAta =
            await getOrCreateAssociatedTokenAccount(
                connection,
                fromWallet,
                mint,
                to
            );

        const amount =
            BigInt(1000000) *
            BigInt(10 ** 9);

        const tx = await transfer(
            connection,
            fromWallet,
            fromAta.address,
            toAta.address,
            fromWallet.publicKey,
            amount
        );

        // ========================================
        // 空投成功 → 寫入 Neon
        // ========================================

        await sql`
            INSERT INTO airdrop_history (
                address,
                count
            )
            VALUES (
                ${address},
                1
            )
            ON CONFLICT (address)
            DO UPDATE SET
                count = airdrop_history.count + 1
        `;

        // ========================================
        // 新增：空投交易紀錄
        // ========================================

        await sql`
            INSERT INTO airdrop_transactions (
                wallet_address,
                amount,
                tx_signature,
                status
            )
            VALUES (
                ${address},
                ${1000000},
                ${tx},
                'success'
            )
        `;

        const newCount = count + 1;

        console.log(
            `💰 【空投成功】地址: ${address} | 累計次數: ${newCount}/3 | TX: ${tx}`
        );

        await ctx.reply(
            `🎉 領取成功！(已領 ${newCount}/3 次)\n` +
            `交易 ID: https://explorer.solana.com/tx/${tx}?cluster=devnet`
        );

    } catch (err) {

        console.error(
            `❌ 【空投失敗】目標地址: ${address} | 原因: ${err.message}`
        );

        await ctx.reply(
            `❌ 失敗原因：${err.message}`
        );
    }
});

// ========================================
// /burn 管理員指令
// ========================================

bot.command('burn', async (ctx) => {

    if (ctx.from.id !== ADMIN_ID) {

        console.log(
            `⚠️ 警告：收到非授權用戶 (${ctx.from.id}) 的銷毀指令。`
        );

        return ctx.reply(
            '⛔ 權限不足！只有項目方管理員可以執行銷毀指令。'
        );
    }

    console.log(
        `🔥 【銷毀啟動】管理員(${ctx.from.id}) 正在執行代幣銷毀...`
    );

    await handleBurn(
        ctx,
        connection,
        fromWallet,
        MINT_ADDRESS
    );
});

// ========================================
// 匯出 Bot
// ========================================

module.exports = bot;