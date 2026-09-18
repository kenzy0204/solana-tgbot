const bot = require('../TGBot'); // 引入你剛剛寫好的 TGBot.js

module.exports = async (req, res) => {
    // 確保只接受來自 Telegram 的 POST 請求
    if (req.method === 'POST') {
        try {
            await bot.handleUpdate(req.body);
            return res.status(200).json({ status: 'success' });
        } catch (error) {
            console.error('Webhook 處理錯誤:', error);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
    } else {
        // 如果有人用瀏覽器直接打開這個網址，給個提示
        return res.status(200).json({ message: 'Solana Telegram Bot Webhook is running!' });
    }
};