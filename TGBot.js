const { Telegraf, Markup } = require('telegraf');

const {
    Connection,
    Keypair,
    PublicKey,
    clusterApiUrl
} = require('@solana/web3.js');

const {
    getOrCreateAssociatedTokenAccount,
    getAccount,
    transferChecked,
    TOKEN_2022_PROGRAM_ID
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
// GENC Token 設定
// ========================================

// GENC 是 Pump.fun Mainnet 上的 Token-2022
const TOKEN_DECIMALS = 6;

// 每次空投 1,000,000 GENC
const AIRDROP_AMOUNT = 1_000_000;

// ========================================
// 環境變數檢查
// ========================================

if (!TG_TOKEN || !PRIVATE_KEY || !MINT_ADDRESS || !process.env.POSTGRES_URL) {
    console.warn(
        '⚠️ 警告：缺少必要的環境變數（TG_TOKEN, PRIVATE_KEY, MINT_ADDRESS, POSTGRES_URL）'
    );
}

// ========================================
// Solana Mainnet 設定
// ========================================

const connection = new Connection(
    clusterApiUrl('mainnet-beta'),
    'confirmed'
);

// ========================================
// 管理錢包
// ========================================

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
        console.error(
            '❌ 讀取白名單失敗：',
            error.message
        );

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
        console.error(
            '❌ 讀取空投紀錄失敗：',
            error.message
        );

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
        '👋 歡迎使用創世版權 GENESIS COPYRIGHT 空投與代幣管理機器人！\n\n' +
        '請點擊下方按鈕開始操作：',

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
        `🤖 【創世版權 GENESIS COPYRIGHT】\n\n` +

        `🌐 區塊鏈：Solana Mainnet\n` +
        `🪙 代幣：GENC\n` +
        `📦 Token Standard：Token-2022\n` +
        `💰 總供給：1,000,000,000 GENC\n` +
        `🔢 Decimals：6\n\n` +

        `【系統技術架構】\n` +
        `1️⃣ 核心後端：Node.js\n` +
        `2️⃣ 機器人框架：Telegraf (Telegram Bot API)\n` +
        `3️⃣ 部署架構：Vercel Serverless\n` +
        `4️⃣ 區塊鏈互動：@solana/web3.js & @solana/spl-token\n` +
        `5️⃣ Token Standard：SPL Token-2022\n` +
        `6️⃣ 資料儲存：Neon PostgreSQL\n` +
        `7️⃣ 安全管理：Vercel Environment Variables`;

    await ctx.reply(introText);
});

// ========================================
// 領取空投
// ========================================

bot.hears('🎁 領取空投', async (ctx) => {

    userStates[ctx.from.id] = 'airdrop';

    await ctx.reply(
        '🎁 【GENC 領取空投】\n\n' +
        '每次可領取 1,000,000 GENC。\n' +
        '每個錢包最多可領取 3 次。\n\n' +
        '👉 請直接貼上您的 Solana 錢包地址即可開始領取。'
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

        const totalAirdropCount =
            Object.values(history)
                .reduce(
                    (total, count) =>
                        total + Number(count),
                    0
                );

        const statsText =
            `📊 【GENESIS COPYRIGHT 即時監控】\n\n` +

            `🌐 區塊鏈網路：Solana Mainnet Beta\n` +
            `🪙 代幣：GENC\n` +
            `📦 Token Standard：Token-2022\n\n` +

            `🔗 代幣 Mint：\n` +
            `${MINT_ADDRESS}\n\n` +

            `👥 白名單總人數：${whitelist.length} 人\n` +
            `🎁 總空投發放次數：${totalAirdropCount} 次\n` +
            `💰 每次空投：${AIRDROP_AMOUNT.toLocaleString()} GENC\n` +
            `💻 狀態：🟢 Vercel 雲端服務運行中`;

        await ctx.reply(statsText);

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
        '🏫 正修科技大學 資訊工程系\n\n' +
        '點擊下方連結前往系網：',

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

    // ========================================
    // 指令不處理
    // ========================================

    if (text.startsWith('/')) {
        return next();
    }

    // ========================================
    // 檢查是不是 Solana 地址
    // ========================================

    const isSolanaAddress =
        /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text);

    if (!isSolanaAddress) {
        return;
    }

    const userId = ctx.from.id;
    const currentMode = userStates[userId];

    // ========================================
    // 必須先進入領取模式
    // ========================================

    if (!currentMode || currentMode !== 'airdrop') {

        return ctx.reply(
            '💡 請先點擊下方的【🎁 領取空投】按鈕，然後再貼上地址！'
        );
    }

    const address = text;

    // ========================================
    // 清除狀態
    // ========================================

    delete userStates[userId];

    console.log(
        `[Airdrop] TG用戶(${userId}) 透過貼上地址申請 GENC 空投 ➡️ 地址: ${address}`
    );

    try {

        // ========================================
        // 驗證 PublicKey
        // ========================================

        const to = new PublicKey(address);

        // ========================================
        // 檢查必要設定
        // ========================================

        if (!fromWallet) {
            throw new Error(
                'PRIVATE_KEY 未設定'
            );
        }

        if (!MINT_ADDRESS) {
            throw new Error(
                'MINT_ADDRESS 未設定'
            );
        }

        // ========================================
        // 取得 Mint
        // ========================================

        const mint = new PublicKey(MINT_ADDRESS);

        // ========================================
        // 確認 Mint 是 Token-2022
        // ========================================

        const mintInfo =
            await connection.getAccountInfo(mint);

        if (!mintInfo) {
            throw new Error(
                '找不到 GENC Mint，請確認 MINT_ADDRESS 是否正確'
            );
        }

        if (
            !mintInfo.owner.equals(
                TOKEN_2022_PROGRAM_ID
            )
        ) {
            throw new Error(
                '目前設定的 Mint 不是 Token-2022 Mint'
            );
        }

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

        const count =
            Number(history[address] || 0);

        if (count >= 3) {

            console.log(
                `⚠️ [攔截] 地址 ${address} 領取額度已滿(3次)，拒絕發送。`
            );

            return ctx.reply(
                '🚫 該地址已領取過 3 次，額度已滿！'
            );
        }

        // ========================================
        // 建立 Token-2022 ATA
        // ========================================

        console.log(
            `[Airdrop] 正在取得發送方 Token-2022 ATA...`
        );

        const fromAta =
            await getOrCreateAssociatedTokenAccount(
                connection,
                fromWallet,
                mint,
                fromWallet.publicKey,
                false,
                'confirmed',
                undefined,
                TOKEN_2022_PROGRAM_ID
            );

        console.log(
            `[Airdrop] 發送方 Token Account: ${fromAta.address.toBase58()}`
        );

        // ========================================
        // 取得 / 建立接收方 Token-2022 ATA
        // ========================================

        console.log(
            `[Airdrop] 正在取得接收方 Token-2022 ATA...`
        );

        const toAta =
            await getOrCreateAssociatedTokenAccount(
                connection,
                fromWallet,
                mint,
                to,
                false,
                'confirmed',
                undefined,
                TOKEN_2022_PROGRAM_ID
            );

        console.log(
            `[Airdrop] 接收方 Token Account: ${toAta.address.toBase58()}`
        );

        // ========================================
        // 確認發送方 GENC 餘額
        // ========================================

        const fromAccount =
            await getAccount(
                connection,
                fromAta.address,
                'confirmed',
                TOKEN_2022_PROGRAM_ID
            );

        // ========================================
        // 1,000,000 GENC
        //
        // GENC decimals = 6
        //
        // 1,000,000 × 10^6
        // = 1,000,000,000,000 最小單位
        // ========================================

        const amount =
            BigInt(AIRDROP_AMOUNT) *
            BigInt(10 ** TOKEN_DECIMALS);

        const availableBalance =
            BigInt(fromAccount.amount);

        if (availableBalance < amount) {

            throw new Error(
                `發送方 GENC 餘額不足。目前餘額：${Number(availableBalance) / 10 ** TOKEN_DECIMALS} GENC`
            );
        }

        // ========================================
        // 開始空投
        // ========================================

        await ctx.reply(
            '⏳ 正在發送 1,000,000 GENC...\n' +
            '請稍候，正在等待 Solana Mainnet 確認。'
        );

        console.log(
            `[Airdrop] 開始轉帳 ${AIRDROP_AMOUNT.toLocaleString()} GENC`
        );

        // ========================================
        // Token-2022 TransferChecked
        // ========================================

        const tx =
            await transferChecked(
                connection,
                fromWallet,
                fromAta.address,
                mint,
                toAta.address,
                fromWallet,
                amount,
                TOKEN_DECIMALS,
                [],
                undefined,
                TOKEN_2022_PROGRAM_ID
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
        // 新增空投交易紀錄
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
                ${AIRDROP_AMOUNT},
                ${tx},
                'success'
            )
        `;

        const newCount =
            count + 1;

        console.log(
            `💰 【GENC 空投成功】地址: ${address} | 累計次數: ${newCount}/3 | TX: ${tx}`
        );

        // ========================================
        // 回覆使用者
        // ========================================

        await ctx.reply(
            `🎉 GENC 領取成功！\n\n` +
            `🪙 數量：${AIRDROP_AMOUNT.toLocaleString()} GENC\n` +
            `📊 已領：${newCount}/3 次\n\n` +
            `🔗 交易：\n` +
            `https://explorer.solana.com/tx/${tx}`
        );

    } catch (err) {

        console.error(
            `❌ 【GENC 空投失敗】目標地址: ${address} | 原因: ${err.message}`
        );

        await ctx.reply(
            `❌ 空投失敗\n\n` +
            `原因：${err.message}`
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
        `🔥 【銷毀啟動】管理員(${ctx.from.id}) 正在執行 GENC 銷毀...`
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