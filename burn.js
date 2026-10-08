// burn.js - GENC Token-2022 Mainnet 銷毀邏輯

const { PublicKey } = require('@solana/web3.js');

const {
    getOrCreateAssociatedTokenAccount,
    getAccount,
    burn,
    TOKEN_2022_PROGRAM_ID
} = require('@solana/spl-token');

const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.POSTGRES_URL);

// ========================================
// GENC Token 設定
// ========================================

const TOKEN_DECIMALS = 6;

// ========================================
// 將人類可讀數量轉成 Token 最小單位
// 例如：
// 1000000 GENC
// → 1000000000000 最小單位
// ========================================

function parseTokenAmount(input) {

    const value = String(input).trim();

    if (!/^\d+(\.\d+)?$/.test(value)) {
        throw new Error(
            '數量格式錯誤，請輸入正確的 GENC 數量'
        );
    }

    const [whole, fraction = ''] = value.split('.');

    if (fraction.length > TOKEN_DECIMALS) {
        throw new Error(
            `GENC 最多只能有 ${TOKEN_DECIMALS} 位小數`
        );
    }

    const paddedFraction =
        fraction.padEnd(TOKEN_DECIMALS, '0');

    return (
        BigInt(whole) *
        (10n ** BigInt(TOKEN_DECIMALS))
        +
        BigInt(paddedFraction || '0')
    );
}

// ========================================
// 銷毀代幣
// ========================================

async function handleBurn(
    ctx,
    connection,
    fromWallet,
    MINT_ADDRESS
) {

    let amountToBurn = null;

    // ========================================
    // 判斷是文字指令還是按鈕
    // ========================================

    if (ctx.message && ctx.message.text) {

        // 例如：
        // /burn 1000000

        const input =
            ctx.message.text
                .trim()
                .split(/\s+/)[1];

        if (!input) {

            return ctx.reply(
                '❌ 格式錯誤！\n\n' +
                '請輸入：\n' +
                '/burn [數量]\n\n' +
                '例如：\n' +
                '/burn 1000000'
            );
        }

        amountToBurn = input;

    } else if (
        ctx.update &&
        ctx.update.callback_query
    ) {

        // ========================================
        // Callback Query
        // ========================================

        await ctx.answerCbQuery()
            .catch(() => {});

        const data =
            ctx.update.callback_query.data;

        const parts =
            data.split('_');

        const input =
            parts[parts.length - 1];

        if (!input) {

            return ctx.reply(
                '❌ 按鈕參數錯誤：無法解析銷毀數量'
            );
        }

        amountToBurn = input;

    } else {

        return ctx.reply(
            '❌ 無法識別的觸發來源'
        );
    }

    // ========================================
    // 轉換 Token 數量
    // ========================================

    let rawAmount;

    try {

        rawAmount =
            parseTokenAmount(amountToBurn);

    } catch (err) {

        return ctx.reply(
            `❌ ${err.message}`
        );
    }

    if (rawAmount <= 0n) {

        return ctx.reply(
            '❌ 銷毀數量必須大於 0！'
        );
    }

    // ========================================
    // 顯示處理訊息
    // ========================================

    await ctx.reply(
        `⏳ 準備銷毀 ${amountToBurn} GENC...\n` +
        `正在等待 Solana Mainnet 確認，請稍候。`
    );

    try {

        // ========================================
        // 檢查錢包
        // ========================================

        if (!fromWallet) {

            throw new Error(
                'PRIVATE_KEY 未設定'
            );
        }

        // ========================================
        // 檢查 Mint
        // ========================================

        const mint =
            new PublicKey(MINT_ADDRESS);

        // ========================================
        // 確認 Mint 存在
        // ========================================

        const mintInfo =
            await connection.getAccountInfo(mint);

        if (!mintInfo) {

            throw new Error(
                '找不到 GENC Mint，請確認 MINT_ADDRESS 是否正確'
            );
        }

        // ========================================
        // 確認是 Token-2022
        // ========================================

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
        // 取得管理錢包的 Token-2022 ATA
        // ========================================

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
            `[Burn] GENC Token Account: ${fromAta.address.toBase58()}`
        );

        // ========================================
        // 取得目前 GENC 餘額
        // ========================================

        const tokenAccount =
            await getAccount(
                connection,
                fromAta.address,
                'confirmed',
                TOKEN_2022_PROGRAM_ID
            );

        const currentBalance =
            BigInt(tokenAccount.amount);

        console.log(
            `[Burn] 目前 GENC 餘額：${currentBalance.toString()}`
        );

        // ========================================
        // 餘額檢查
        // ========================================

        if (currentBalance < rawAmount) {

            const readableBalance =
                Number(currentBalance) /
                10 ** TOKEN_DECIMALS;

            throw new Error(
                `GENC 餘額不足，目前可銷毀餘額約為 ${readableBalance.toLocaleString()} GENC`
            );
        }

        // ========================================
        // 執行 Token-2022 Burn
        // ========================================

        console.log(
            `[Burn] 開始銷毀 ${amountToBurn} GENC...`
        );

        const tx =
            await burn(
                connection,
                fromWallet,
                fromAta.address,
                mint,
                fromWallet,
                rawAmount,
                [],
                undefined,
                TOKEN_2022_PROGRAM_ID
            );

        // ========================================
        // 寫入 Neon
        // ========================================

        await sql`
            INSERT INTO burn_transactions (
                amount,
                tx_signature,
                status
            )
            VALUES (
                ${amountToBurn},
                ${tx},
                'success'
            )
        `;

        // ========================================
        // 成功
        // ========================================

        console.log(
            `🔥 【GENC 銷毀成功】` +
            `數量: ${amountToBurn} GENC | ` +
            `TX: ${tx}`
        );

        await ctx.reply(
            `🔥 GENC 銷毀成功！\n\n` +
            `🪙 銷毀數量：${amountToBurn} GENC\n` +
            `🌐 網路：Solana Mainnet Beta\n\n` +
            `🔗 交易：\n` +
            `https://explorer.solana.com/tx/${tx}\n\n` +
            `⚠️ 代幣供給量已永久減少。`
        );

    } catch (err) {

        console.error(
            `❌ 【GENC 銷毀失敗】原因：${err.message}`
        );

        await ctx.reply(
            `❌ GENC 銷毀失敗\n\n` +
            `原因：${err.message}`
        );
    }
}

// ========================================
// 匯出
// ========================================

module.exports = handleBurn;