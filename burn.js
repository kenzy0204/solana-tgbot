// burn.js - 專門處理銷毀代幣的邏輯（同時支援文字與按鈕）
const { PublicKey } = require('@solana/web3.js');
const { getOrCreateAssociatedTokenAccount, burn } = require('@solana/spl-token');

// 建立一個函式，接收來自外部的參數
async function handleBurn(ctx, connection, fromWallet, MINT_ADDRESS) {
    let amountToBurn = 0;

    // 判斷是「文字指令」還是「按鈕點擊」
    if (ctx.message && ctx.message.text) {
        // 處理 /burn 100 的文字輸入
        const input = ctx.message.text.split(' ')[1];
        if (!input || isNaN(input)) return ctx.reply('❌ 格式錯誤！請輸入：/burn [數量]');
        amountToBurn = parseFloat(input);
    } else if (ctx.update && ctx.update.callback_query) {
        // 處理按鈕點擊 (Callback Query)
        await ctx.answerCbQuery().catch(() => {}); // 防止按鈕轉圈圈
        const data = ctx.update.callback_query.data;
        // 假設你的按鈕 data 格式是 "burn_100" 或直接帶數字，這裡嘗試抓取後面的數字
        const parts = data.split('_');
        const input = parts[parts.length - 1]; 
        
        if (!input || isNaN(input)) {
            return ctx.reply('❌ 按鈕參數錯誤：無法解析銷毀數量');
        }
        amountToBurn = parseFloat(input);
    } else {
        return ctx.reply('❌ 無法識別的觸發來源');
    }

    if (amountToBurn <= 0) return ctx.reply('❌ 數量必須大於 0！');

    ctx.reply(`⏳ 準備銷毀 ${amountToBurn} 枚代幣...請稍候`);

    try {
        const mint = new PublicKey(MINT_ADDRESS);
        const fromAta = await getOrCreateAssociatedTokenAccount(connection, fromWallet, mint, fromWallet.publicKey);
        
        // 執行銷毀動作
        const tx = await burn(
            connection,
            fromWallet,
            fromAta.address,
            mint,
            fromWallet,
            amountToBurn * (10 ** 9) // 假設小數點為 9 位
        );
        
        ctx.reply(`🔥 成功銷毀 ${amountToBurn} 枚代幣！\n總供應量已永久減少。\n交易 ID: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
    } catch (err) {
        ctx.reply(`❌ 銷毀失敗：${err.message}`);
    }
}

// 將這個函式導出，讓其他檔案可以抓取
module.exports = handleBurn;