// 載入環境變數與必要套件
require('@dotenvx/dotenvx').config({ path: 'password.env' });

const express = require('express');
const { neon } = require('@neondatabase/serverless');
const {
    Connection,
    PublicKey,
    clusterApiUrl
} = require('@solana/web3.js');
const { getMint } = require('@solana/spl-token');

const app = express();
const PORT = process.env.PORT || 3000;
const MINT_ADDRESS = process.env.MINT_ADDRESS || '';

const sql = neon(process.env.POSTGRES_URL);

// 連線到 Solana Devnet 測試網
const connection = new Connection(
    clusterApiUrl('devnet'),
    'confirmed'
);

// ========================================
// 從 Neon 讀取白名單
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
// 從 Neon 讀取空投紀錄
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
// 從 Neon 讀取最近空投交易紀錄
// ========================================

async function getTransactions() {
    try {
        const rows = await sql`
            SELECT
                id,
                wallet_address,
                amount,
                tx_signature,
                status,
                created_at
            FROM airdrop_transactions
            ORDER BY created_at DESC
            LIMIT 10
        `;

        return rows;

    } catch (error) {
        console.error(
            '❌ 讀取空投交易紀錄失敗：',
            error.message
        );
        return [];
    }
}

// ========================================
// 從 Neon 讀取最近 Burn 交易紀錄
// ========================================

async function getBurnTransactions() {
    try {
        const rows = await sql`
            SELECT
                id,
                amount,
                tx_signature,
                status,
                created_at
            FROM burn_transactions
            ORDER BY created_at DESC
            LIMIT 10
        `;

        return rows;

    } catch (error) {
        console.error(
            '❌ 讀取 Burn 交易紀錄失敗：',
            error.message
        );
        return [];
    }
}

// ========================================
// 取得鏈上目前代幣總供應量
// ========================================

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

        const currentSupply =
            Number(mintInfo.supply) /
            (10 ** mintInfo.decimals);

        return currentSupply;

    } catch (error) {
        console.log(
            '⚠️ 無法取得鏈上供應量：',
            error.message
        );

        return 1000000000;
    }
}

// ========================================
// API：即時統計資料
// ========================================

app.get('/api/stats', async (req, res) => {
    try {
        const whitelist = await getWhitelist();
        const history = await getHistory();

        let totalAirdropCount = 0;

        for (const count of Object.values(history)) {
            totalAirdropCount += Number(count);
        }

        const currentSupply = await getCurrentSupply();

        res.json({
            whitelistCount: whitelist.length,
            totalAirdropCount: totalAirdropCount,
            currentSupply: currentSupply,
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
});

// ========================================
// 首頁：網頁版儀表板
// ========================================

app.get('/', async (req, res) => {
    try {
        const whitelist = await getWhitelist();
        const history = await getHistory();
        const transactions = await getTransactions();
        const burnTransactions = await getBurnTransactions();

        let totalAirdropCount = 0;
        let historyRows = '';
        let transactionRows = '';
        let burnTransactionRows = '';

        // ========================================
        // 參與者領取紀錄
        // ========================================

        for (const [address, count] of Object.entries(history)) {
            totalAirdropCount += Number(count);

            historyRows += `
                <tr class="text-white">

                    <td style="font-family: monospace; word-break: break-all;">
                        ${address}
                    </td>

                    <td>
                        <span class="badge ${
                            count >= 3
                                ? 'bg-danger'
                                : 'bg-success'
                        }">
                            ${count} / 3 次
                        </span>
                    </td>

                    <td>
                        <a
                            href="https://explorer.solana.com/address/${address}?cluster=devnet"
                            target="_blank"
                            class="btn btn-sm btn-outline-light"
                        >
                            查看瀏覽器
                        </a>
                    </td>

                </tr>
            `;
        }

        // ========================================
        // 最近空投交易紀錄
        // ========================================

        for (const transaction of transactions) {

            const date = new Date(
                transaction.created_at
            ).toLocaleString('zh-TW', {
                timeZone: 'Asia/Taipei'
            });

            const shortAddress =
                transaction.wallet_address.slice(0, 8) +
                '...' +
                transaction.wallet_address.slice(-6);

            const shortTx =
                transaction.tx_signature.slice(0, 10) +
                '...' +
                transaction.tx_signature.slice(-8);

            transactionRows += `
                <tr class="text-white">

                    <td>
                        ${date}
                    </td>

                    <td style="font-family: monospace;">
                        ${shortAddress}
                    </td>

                    <td>
                        ${Number(transaction.amount).toLocaleString()} 枚
                    </td>

                    <td>
                        <span class="badge ${
                            transaction.status === 'success'
                                ? 'bg-success'
                                : 'bg-danger'
                        }">
                            ${transaction.status}
                        </span>
                    </td>

                    <td>
                        <a
                            href="https://explorer.solana.com/tx/${transaction.tx_signature}?cluster=devnet"
                            target="_blank"
                            class="btn btn-sm btn-outline-info"
                        >
                            ${shortTx}
                        </a>
                    </td>

                </tr>
            `;
        }

        // ========================================
        // 最近 Burn 交易紀錄
        // ========================================

        for (const transaction of burnTransactions) {

            const date = new Date(
                transaction.created_at
            ).toLocaleString('zh-TW', {
                timeZone: 'Asia/Taipei'
            });

            const shortTx =
                transaction.tx_signature.slice(0, 10) +
                '...' +
                transaction.tx_signature.slice(-8);

            burnTransactionRows += `
                <tr class="text-white">

                    <td>
                        ${date}
                    </td>

                    <td>
                        ${Number(transaction.amount).toLocaleString()} 枚
                    </td>

                    <td>
                        <span class="badge ${
                            transaction.status === 'success'
                                ? 'bg-success'
                                : 'bg-danger'
                        }">
                            ${transaction.status}
                        </span>
                    </td>

                    <td>
                        <a
                            href="https://explorer.solana.com/tx/${transaction.tx_signature}?cluster=devnet"
                            target="_blank"
                            class="btn btn-sm btn-outline-danger"
                        >
                            ${shortTx}
                        </a>
                    </td>

                </tr>
            `;
        }

        const currentSupply = await getCurrentSupply();

        const html = `
        <!DOCTYPE html>

        <html lang="zh-TW">

        <head>

            <meta charset="UTF-8">

            <meta
                name="viewport"
                content="width=device-width, initial-scale=1.0"
            >

            <title>
                Solana 專題代幣即時儀表板
            </title>

            <link
                href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css"
                rel="stylesheet"
            >

            <meta
                http-equiv="refresh"
                content="10"
            >

            <style>

                body {
                    background:
                        linear-gradient(
                            135deg,
                            #0f172a 0%,
                            #1e1b4b 100%
                        );

                    color: #f8fafc;

                    min-height: 100vh;
                }

                .custom-card {
                    background:
                        rgba(255, 255, 255, 0.05);

                    backdrop-filter: blur(10px);

                    border:
                        1px solid
                        rgba(255, 255, 255, 0.1);
                }

                .table-dark-custom {
                    background-color:
                        transparent !important;

                    color: #fff;
                }

            </style>

        </head>

        <body>

            <div class="container py-5">

                <header
                    class="pb-3 mb-4 border-bottom border-secondary d-flex justify-content-between align-items-center flex-wrap"
                >

                    <div>

                        <h1 class="h3 fw-bold text-white">
                            🚀 Solana 畢業專題代幣管理系統 - 即時儀表板
                        </h1>

                        <p class="text-light opacity-75 m-0">

                            系統狀態：

                            <span class="text-success fw-bold">
                                ● 運行中 (Devnet 測試網)
                            </span>

                            |

                            畫面每 10 秒自動更新

                        </p>

                    </div>

                    <div class="mt-2 mt-md-0">

                        <a
                            href="https://t.me/你的Telegram機器人名稱"
                            target="_blank"
                            class="btn btn-outline-info fw-bold"
                        >
                            📱 開啟 Telegram 機器人
                        </a>

                    </div>

                </header>

                <!-- 系統公告 -->

                <div
                    class="alert alert-success shadow-sm mb-4"
                    role="alert"
                >

                    <h5 class="alert-heading fw-bold">
                        📢 系統公告
                    </h5>

                    <p class="mb-0">
                        🟢 系統目前正常運行，暫無重要公告。
                    </p>

                </div>

                <!-- 數據卡片區 -->

                <div class="row mb-4">

                    <div class="col-md-4 mb-3">

                        <div class="card bg-danger shadow h-100 border-0">

                            <div class="card-body">

                                <h5 class="card-title fw-bold text-dark">
                                    👥 白名單總人數
                                </h5>

                                <h2 class="display-6 fw-bold text-dark">
                                    ${whitelist.length} 人
                                </h2>

                            </div>

                        </div>

                    </div>

                    <div class="col-md-4 mb-3">

                        <div class="card bg-warning shadow h-100 border-0">

                            <div class="card-body">

                                <h5 class="card-title fw-bold text-dark">
                                    🎁 總空投發放次數
                                </h5>

                                <h2 class="display-6 fw-bold text-dark">
                                    ${totalAirdropCount} 次
                                </h2>

                            </div>

                        </div>

                    </div>

                    <div class="col-md-4 mb-3">

                        <div class="card bg-success shadow h-100 border-0">

                            <div class="card-body">

                                <h5 class="card-title fw-bold text-dark">
                                    💰 鏈上即時剩餘總數量
                                </h5>

                                <h2 class="display-6 fw-bold text-dark">
                                    ${currentSupply.toLocaleString()} 枚
                                </h2>

                            </div>

                        </div>

                    </div>

                </div>

                <!-- 合約地址 -->

                <div class="card custom-card shadow-sm mb-4">

                    <div class="card-body">

                        <h5 class="card-title text-info">
                            🪙 代幣合約地址 (Mint Address)
                        </h5>

                        <code class="text-break fs-5 text-warning">
                            ${MINT_ADDRESS}
                        </code>

                    </div>

                </div>

                <!-- 詳細名單 -->

                <div class="card custom-card shadow-sm">

                    <div
                        class="card-header bg-transparent py-3 border-bottom border-secondary"
                    >

                        <h5 class="m-0 fw-bold text-white">
                            📋 參與者領取紀錄與狀態
                        </h5>

                    </div>

                    <div class="card-body p-0">

                        <div class="table-responsive">

                            <table
                                class="table table-hover mb-0 align-middle table-dark-custom"
                            >

                                <thead>

                                    <tr class="text-secondary">

                                        <th>
                                            Solana 錢包地址
                                        </th>

                                        <th>
                                            已領取次數
                                        </th>

                                        <th>
                                            鏈上瀏覽器
                                        </th>

                                    </tr>

                                </thead>

                                <tbody>

                                    ${
                                        historyRows ||
                                        `
                                        <tr>

                                            <td
                                                colspan="3"
                                                class="text-center py-4 text-muted"
                                            >
                                                目前尚無領取紀錄
                                            </td>

                                        </tr>
                                        `
                                    }

                                </tbody>

                            </table>

                        </div>

                    </div>

                </div>

                <!-- 最近空投交易 -->

                <div class="card custom-card shadow-sm mt-4">

                    <div
                        class="card-header bg-transparent py-3 border-bottom border-secondary"
                    >

                        <h5 class="m-0 fw-bold text-white">
                            📜 最近空投交易
                        </h5>

                    </div>

                    <div class="card-body p-0">

                        <div class="table-responsive">

                            <table
                                class="table table-hover mb-0 align-middle table-dark-custom"
                            >

                                <thead>

                                    <tr class="text-secondary">

                                        <th>
                                            時間
                                        </th>

                                        <th>
                                            錢包
                                        </th>

                                        <th>
                                            空投數量
                                        </th>

                                        <th>
                                            狀態
                                        </th>

                                        <th>
                                            交易
                                        </th>

                                    </tr>

                                </thead>

                                <tbody>

                                    ${
                                        transactionRows ||
                                        `
                                        <tr>

                                            <td
                                                colspan="5"
                                                class="text-center py-4 text-muted"
                                            >
                                                目前尚無空投交易
                                            </td>

                                        </tr>
                                        `
                                    }

                                </tbody>

                            </table>

                        </div>

                    </div>

                </div>

                <!-- 最近 Burn 交易 -->

                <div class="card custom-card shadow-sm mt-4">

                    <div
                        class="card-header bg-transparent py-3 border-bottom border-secondary"
                    >

                        <h5 class="m-0 fw-bold text-white">
                            🔥 最近代幣銷毀
                        </h5>

                    </div>

                    <div class="card-body p-0">

                        <div class="table-responsive">

                            <table
                                class="table table-hover mb-0 align-middle table-dark-custom"
                            >

                                <thead>

                                    <tr class="text-secondary">

                                        <th>
                                            時間
                                        </th>

                                        <th>
                                            銷毀數量
                                        </th>

                                        <th>
                                            狀態
                                        </th>

                                        <th>
                                            交易
                                        </th>

                                    </tr>

                                </thead>

                                <tbody>

                                    ${
                                        burnTransactionRows ||
                                        `
                                        <tr>

                                            <td
                                                colspan="4"
                                                class="text-center py-4 text-muted"
                                            >
                                                目前尚無 Burn 交易
                                            </td>

                                        </tr>
                                        `
                                    }

                                </tbody>

                            </table>

                        </div>

                    </div>

                </div>

                <footer
                    class="text-center mt-4 text-secondary small"
                >

                    <p>
                        正修科技大學資訊工程系 |
                        畢業專題展示系統
                    </p>

                </footer>

            </div>

        </body>

        </html>
        `;

        res.send(html);

    } catch (error) {

        console.error(
            '❌ 首頁發生錯誤：',
            error.message
        );

        res.status(500).send(
            '無法載入儀表板'
        );
    }
});

// ========================================
// 啟動網頁伺服器
// ========================================

app.listen(PORT, () => {

    console.log(
        '=================================================='
    );

    console.log(
        '🌐 網頁版儀表板已成功啟動！'
    );

    console.log(
        `👉 請在瀏覽器輸入: http://localhost:${PORT}`
    );

    console.log(
        '=================================================='
    );

});