require('@dotenvx/dotenvx').config({ path: 'password.env' });

const express = require('express');
const { neon } = require('@neondatabase/serverless');

const {
    Connection,
    PublicKey,
    clusterApiUrl
} = require('@solana/web3.js');

const {
    getMint
} = require('@solana/spl-token');

const app = express();

app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
const MINT_ADDRESS = process.env.MINT_ADDRESS || '';

const sql = neon(process.env.POSTGRES_URL);

const connection = new Connection(
    clusterApiUrl('devnet'),
    'confirmed'
);

const INITIAL_SUPPLY = 1000000000;

// ========================================
// Neon：白名單
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
// Neon：空投歷史
// ========================================

async function getHistory() {

    try {

        const rows = await sql`
            SELECT address, count
            FROM airdrop_history
        `;

        const history = {};

        for (const row of rows) {

            history[row.address] =
                Number(row.count);
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
// Neon：最近空投
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
// Neon：最近 Burn
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
// Solana：目前供應量
// ========================================

async function getCurrentSupply() {

    try {

        if (!MINT_ADDRESS) {

            return INITIAL_SUPPLY;
        }

        const mintPubkey =
            new PublicKey(MINT_ADDRESS);

        const mintInfo =
            await getMint(
                connection,
                mintPubkey
            );

        return Number(mintInfo.supply) /
            (10 ** mintInfo.decimals);

    } catch (error) {

        console.log(
            '⚠️ 無法取得鏈上供應量：',
            error.message
        );

        return INITIAL_SUPPLY;
    }
}

// ========================================
// API：即時統計
// ========================================

app.get('/api/stats', async (req, res) => {

    try {

        const whitelist =
            await getWhitelist();

        const history =
            await getHistory();

        const currentSupply =
            await getCurrentSupply();

        let totalAirdropCount = 0;

        for (
            const count of Object.values(history)
        ) {

            totalAirdropCount +=
                Number(count);
        }

        const burnedAmount =
            Math.max(
                INITIAL_SUPPLY -
                currentSupply,
                0
            );

        const burnedPercentage =
            (burnedAmount /
                INITIAL_SUPPLY) *
            100;

        res.json({

            whitelistCount:
                whitelist.length,

            totalAirdropCount,

            currentSupply,

            initialSupply:
                INITIAL_SUPPLY,

            burnedAmount,

            burnedPercentage,

            mintAddress:
                MINT_ADDRESS
        });

    } catch (error) {

        console.error(
            '❌ stats API 發生錯誤：',
            error.message
        );

        res.status(500).json({

            error:
                '無法取得即時統計資料'
        });
    }
});

// ========================================
// 首頁
// ========================================

app.get('/', async (req, res) => {

    try {

        const whitelist =
            await getWhitelist();

        const history =
            await getHistory();

        const transactions =
            await getTransactions();

        const burnTransactions =
            await getBurnTransactions();

        const currentSupply =
            await getCurrentSupply();

        // ========================================
        // Token Supply
        // ========================================

        const burnedAmount =
            Math.max(
                INITIAL_SUPPLY -
                currentSupply,
                0
            );

        const burnedPercentage =
            (burnedAmount /
                INITIAL_SUPPLY) *
            100;

        const supplyPercentage =
            Math.max(
                100 -
                burnedPercentage,
                0
            );

        // ========================================
        // 空投統計
        // ========================================

        let totalAirdropCount = 0;

        for (
            const count of Object.values(history)
        ) {

            totalAirdropCount +=
                Number(count);
        }

        // ========================================
        // 日期格式
        // ========================================

        function formatDate(date) {

            return new Date(date)
                .toLocaleString(
                    'zh-TW',
                    {
                        timeZone:
                            'Asia/Taipei'
                    }
                );
        }

        // ========================================
        // 縮短地址
        // ========================================

        function shortAddress(address) {

            if (!address) {
                return '-';
            }

            return (
                address.slice(0, 7) +
                '...' +
                address.slice(-5)
            );
        }

        // ========================================
        // 參與者
        // ========================================

        let historyRows = '';

        for (
            const [address, count]
            of Object.entries(history)
        ) {

            const remaining =
                Math.max(
                    3 -
                    Number(count),
                    0
                );

            let badgeClass =
                'available';

            let badgeText =
                '可領取';

            if (Number(count) >= 3) {

                badgeClass =
                    'limit';

                badgeText =
                    '已達上限';

            } else if (Number(count) >= 2) {

                badgeClass =
                    'warning';

                badgeText =
                    '可領 1 次';
            }

            historyRows += `

                <tr>

                    <td class="wallet-cell">

                        <span>
                            ${shortAddress(address)}
                        </span>

                    </td>

                    <td>
                        ${count} / 3
                    </td>

                    <td>

                        <span
                            class="status-badge ${badgeClass}"
                        >
                            ${badgeText}
                        </span>

                    </td>

                    <td>

                        <a
                            href="https://explorer.solana.com/address/${address}?cluster=devnet"
                            target="_blank"
                            class="table-link"
                        >
                            查看 ↗
                        </a>

                    </td>

                </tr>
            `;
        }

        // ========================================
        // 最近空投
        // ========================================

        let transactionRows = '';

        for (
            const transaction
            of transactions
        ) {

            const statusClass =
                transaction.status === 'success'
                    ? 'success'
                    : 'failed';

            transactionRows += `

                <tr>

                    <td>
                        ${formatDate(
                            transaction.created_at
                        )}
                    </td>

                    <td class="wallet-cell">
                        ${shortAddress(
                            transaction.wallet_address
                        )}
                    </td>

                    <td>
                        ${Number(
                            transaction.amount
                        ).toLocaleString()}
                    </td>

                    <td>

                        <span
                            class="status-badge ${statusClass}"
                        >
                            ${
                                transaction.status === 'success'
                                    ? '成功'
                                    : '失敗'
                            }
                        </span>

                    </td>

                    <td>

                        <a
                            href="https://explorer.solana.com/tx/${transaction.tx_signature}?cluster=devnet"
                            target="_blank"
                            class="table-link"
                        >
                            查看 ↗
                        </a>

                    </td>

                </tr>
            `;
        }

        // ========================================
        // Burn
        // ========================================

        let burnRows = '';

        for (
            const transaction
            of burnTransactions
        ) {

            const statusClass =
                transaction.status === 'success'
                    ? 'success'
                    : 'failed';

            burnRows += `

                <tr>

                    <td>
                        ${formatDate(
                            transaction.created_at
                        )}
                    </td>

                    <td>

                        ${Number(
                            transaction.amount
                        ).toLocaleString()}

                    </td>

                    <td>

                        <span
                            class="status-badge ${statusClass}"
                        >
                            ${
                                transaction.status === 'success'
                                    ? '成功'
                                    : '失敗'
                            }
                        </span>

                    </td>

                    <td>

                        <a
                            href="https://explorer.solana.com/tx/${transaction.tx_signature}?cluster=devnet"
                            target="_blank"
                            class="table-link"
                        >
                            查看 ↗
                        </a>

                    </td>

                </tr>
            `;
        }

        // ========================================
        // HTML
        // ========================================

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
    創世版權｜GENESIS COPYRIGHT
</title>

<meta
    http-equiv="refresh"
    content="10"
>

<link
    href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css"
    rel="stylesheet"
>

<style>

/* ========================================
   基礎
======================================== */

* {
    box-sizing: border-box;
}

body {

    margin: 0;

    min-height: 100vh;

    color: #f5f7ff;

    font-family:
        Inter,
        "Noto Sans TC",
        "Microsoft JhengHei",
        sans-serif;

    background:

        radial-gradient(
            circle at 50% -10%,
            rgba(54, 89, 180, 0.22),
            transparent 45%
        ),

        linear-gradient(
            180deg,
            #030814 0%,
            #050b1d 45%,
            #020612 100%
        );
}

/* ========================================
   Navbar
======================================== */

.top-nav {

    position: relative;

    z-index: 20;

    height: 74px;

    display: flex;

    align-items: center;

    justify-content: space-between;

    padding:
        0 42px;

    border-bottom:
        1px solid
        rgba(108, 149, 255, 0.18);

    background:
        rgba(3, 8, 20, 0.92);

    backdrop-filter:
        blur(18px);
}

.brand {

    display: flex;

    align-items: center;

    gap: 13px;

    color: #fff;

    text-decoration: none;
}

.brand-mark {

    width: 42px;

    height: 42px;

    border-radius: 12px;

    object-fit: cover;

    border:
        1px solid
        rgba(255, 206, 111, 0.45);

    box-shadow:
        0 0 18px
        rgba(255, 192, 72, 0.18);
}

.brand-text {

    display: flex;

    flex-direction: column;

    line-height: 1;
}

.brand-cn {

    font-size: 18px;

    font-weight: 800;

    letter-spacing: 4px;
}

.brand-en {

    margin-top: 5px;

    font-size: 8px;

    letter-spacing: 2.5px;

    color: #aebbd7;
}

.nav-links {

    display: flex;

    align-items: center;

    gap: 34px;
}

.nav-links a {

    position: relative;

    color: #cbd5eb;

    text-decoration: none;

    font-size: 14px;

    padding:
        27px 0;

    transition:
        color .2s ease;
}

.nav-links a:hover,
.nav-links a.active {

    color: #fff;
}

.nav-links a.active::after {

    content: "";

    position: absolute;

    left: 0;

    right: 0;

    bottom: 0;

    height: 2px;

    background:
        linear-gradient(
            90deg,
            #4d8dff,
            #8b5cff
        );

    box-shadow:
        0 0 12px
        rgba(77, 141, 255, .8);
}

.network-status {

    display: flex;

    align-items: center;

    gap: 10px;

    padding:
        9px 18px;

    border-radius: 999px;

    color: #21efb0;

    background:
        rgba(15, 207, 155, .08);

    border:
        1px solid
        rgba(15, 207, 155, .35);

    font-size: 13px;

    font-weight: 700;

    letter-spacing: 1px;
}

.network-dot {

    width: 9px;

    height: 9px;

    border-radius: 50%;

    background: #19e6a3;

    box-shadow:
        0 0 12px
        rgba(25, 230, 163, .9);
}

/* ========================================
   Main
======================================== */

.dashboard {

    width: min(
        1500px,
        calc(100% - 56px)
    );

    margin: 0 auto;

    padding-bottom: 50px;
}

/* ========================================
   Hero
======================================== */

.hero {

    position: relative;

    min-height: 480px;

    margin-bottom: 24px;

    overflow: hidden;

    border:
        1px solid
        rgba(93, 134, 229, .25);

    border-radius: 0 0 18px 18px;

    background-image:

        linear-gradient(
            90deg,
            rgba(2, 7, 18, .58),
            rgba(2, 7, 18, .15) 60%,
            rgba(2, 7, 18, .05)
        ),

        url('/genesis-copyright-hero.png');

    background-size: cover;

    background-position: center;

    box-shadow:
        0 30px 80px
        rgba(0, 0, 0, .45);
}

.hero::after {

    content: "";

    position: absolute;

    inset: 0;

    pointer-events: none;

    background:

        linear-gradient(
            180deg,
            transparent 65%,
            rgba(2, 6, 17, .78) 100%
        );
}

.hero-content {

    position: relative;

    z-index: 2;

    width: 52%;

    min-height: 480px;

    display: flex;

    flex-direction: column;

    justify-content: center;

    padding:
        65px 0 65px 62px;
}

.hero-kicker {

    margin-bottom: 15px;

    color: #d8dff0;

    font-size: 12px;

    letter-spacing: 6px;

    font-weight: 600;
}

.hero-title {

    margin: 0;

    font-size:
        clamp(
            48px,
            5vw,
            82px
        );

    line-height: 1;

    font-weight: 800;

    letter-spacing: 8px;

    color: #fff;

    text-shadow:
        0 3px 20px
        rgba(0, 0, 0, .8);
}

.hero-en {

    margin-top: 15px;

    color: #fff;

    font-size: 22px;

    letter-spacing: 9px;

    font-weight: 500;
}

.hero-line {

    width: 48px;

    height: 2px;

    margin:
        17px 0;

    background:
        #e9c77d;

    box-shadow:
        0 0 12px
        rgba(233, 199, 125, .7);
}

.hero-description {

    margin: 0;

    color: #d7e1f5;

    font-size: 18px;

    line-height: 1.8;

    max-width: 590px;
}

.hero-sub-description {

    margin-top: 4px;

    color: #94a6c7;

    font-size: 14px;
}

.hero-buttons {

    display: flex;

    gap: 14px;

    margin-top: 27px;
}

.hero-btn {

    min-width: 220px;

    padding:
        14px 24px;

    display: inline-flex;

    justify-content: center;

    align-items: center;

    border-radius: 11px;

    text-decoration: none;

    font-size: 14px;

    font-weight: 700;

    transition:
        transform .2s ease,
        box-shadow .2s ease;
}

.hero-btn:hover {

    transform:
        translateY(-2px);
}

.hero-btn-primary {

    color: white;

    background:
        linear-gradient(
            100deg,
            #198dff,
            #7549f5
        );

    border:
        1px solid
        rgba(141, 196, 255, .65);

    box-shadow:
        0 8px 28px
        rgba(67, 110, 255, .35);
}

.hero-btn-secondary {

    color: #fff;

    background:
        rgba(5, 12, 29, .78);

    border:
        1px solid
        rgba(121, 159, 235, .65);
}

/* ========================================
   Announcement
======================================== */

.announcement {

    margin-bottom: 18px;

    padding:
        18px 22px;

    border-radius: 10px;

    border:
        1px solid
        rgba(27, 155, 255, .32);

    background:
        linear-gradient(
            90deg,
            rgba(6, 45, 75, .48),
            rgba(7, 22, 44, .72)
        );

    display: flex;

    align-items: center;

    justify-content: space-between;

    gap: 20px;
}

.announcement-title {

    display: flex;

    align-items: center;

    gap: 10px;

    font-size: 15px;

    font-weight: 700;
}

.announcement-title span {

    color: #4db7ff;

    font-size: 20px;
}

.announcement-text {

    margin-top: 5px;

    color: #9fb0cc;

    font-size: 13px;
}

.announcement-time {

    color: #8294b4;

    font-size: 12px;
}

/* ========================================
   Stats
======================================== */

.stats-grid {

    display: grid;

    grid-template-columns:
        repeat(3, 1fr);

    gap: 20px;

    margin-bottom: 20px;
}

.stat-card {

    position: relative;

    min-height: 150px;

    padding: 25px;

    overflow: hidden;

    border-radius: 12px;

    background:
        rgba(7, 17, 39, .8);

    border:
        1px solid
        rgba(60, 115, 207, .42);

    box-shadow:
        0 12px 30px
        rgba(0, 0, 0, .25);
}

.stat-card::after {

    content: "";

    position: absolute;

    width: 140px;

    height: 140px;

    right: -60px;

    bottom: -70px;

    border-radius: 50%;

    opacity: .16;

    filter: blur(5px);
}

.stat-blue {

    border-color:
        rgba(28, 132, 255, .7);
}

.stat-blue::after {

    background: #168bff;
}

.stat-purple {

    border-color:
        rgba(190, 64, 255, .65);
}

.stat-purple::after {

    background: #c33dff;
}

.stat-green {

    border-color:
        rgba(20, 220, 170, .62);
}

.stat-green::after {

    background: #1de5ac;
}

.stat-top {

    display: flex;

    align-items: flex-start;

    gap: 18px;
}

.stat-icon {

    width: 58px;

    height: 58px;

    flex-shrink: 0;

    display: flex;

    align-items: center;

    justify-content: center;

    border-radius: 13px;

    font-size: 28px;
}

.stat-blue .stat-icon {

    background:
        rgba(22, 118, 255, .2);

    color: #53b3ff;
}

.stat-purple .stat-icon {

    background:
        rgba(183, 58, 255, .2);

    color: #e07aff;
}

.stat-green .stat-icon {

    background:
        rgba(18, 211, 157, .18);

    color: #43edc1;
}

.stat-label {

    color: #dbe4f5;

    font-size: 15px;

    font-weight: 600;
}

.stat-number {

    margin-top: 7px;

    color: #fff;

    font-size: 34px;

    line-height: 1;

    font-weight: 800;
}

.stat-en {

    margin-top: 8px;

    color: #7890b8;

    font-size: 12px;
}

.stat-change {

    position: absolute;

    right: 22px;

    bottom: 20px;

    padding:
        7px 11px;

    border-radius: 999px;

    color: #27e9af;

    background:
        rgba(16, 207, 155, .08);

    font-size: 12px;
}

/* ========================================
   Section Cards
======================================== */

.section-grid {

    display: grid;

    grid-template-columns:
        1.2fr .9fr;

    gap: 18px;

    margin-bottom: 18px;
}

.panel {

    border:
        1px solid
        rgba(67, 106, 175, .38);

    border-radius: 11px;

    background:
        rgba(5, 15, 34, .83);

    overflow: hidden;
}

.panel-header {

    padding:
        18px 22px;

    border-bottom:
        1px solid
        rgba(81, 119, 181, .2);

    display: flex;

    justify-content: space-between;

    align-items: center;
}

.panel-title {

    display: flex;

    align-items: center;

    gap: 10px;

    font-size: 15px;

    font-weight: 700;
}

.panel-title-icon {

    color: #5ab5ff;
}

.panel-body {

    padding: 24px;
}

/* ========================================
   Supply
======================================== */

.supply-layout {

    display: grid;

    grid-template-columns:
        240px 1fr;

    gap: 30px;

    align-items: center;
}

.donut {

    width: 210px;

    height: 210px;

    margin: auto;

    border-radius: 50%;

    display: flex;

    justify-content: center;

    align-items: center;

    background:

        conic-gradient(
            #ff5964
                ${burnedPercentage}%,

            #18d6a2
                ${burnedPercentage}%
                100%
        );

    position: relative;

    box-shadow:
        0 0 35px
        rgba(26, 206, 167, .13);
}

.donut::before {

    content: "";

    position: absolute;

    inset: 22px;

    border-radius: 50%;

    background:
        #061128;

    border:
        1px solid
        rgba(79, 120, 188, .25);
}

.donut-content {

    position: relative;

    z-index: 2;

    text-align: center;
}

.donut-number {

    font-size: 27px;

    font-weight: 800;
}

.donut-label {

    margin-top: 5px;

    color: #8092b5;

    font-size: 12px;
}

.supply-list {

    display: flex;

    flex-direction: column;

    gap: 18px;
}

.supply-row {

    display: flex;

    justify-content: space-between;

    align-items: center;

    gap: 20px;

    padding-bottom: 14px;

    border-bottom:
        1px solid
        rgba(73, 104, 155, .16);
}

.supply-name {

    color: #94a7c8;

    font-size: 13px;
}

.supply-value {

    color: #f1f5ff;

    font-size: 18px;

    font-weight: 700;
}

.supply-value.green {

    color: #28e0aa;
}

.supply-value.red {

    color: #ff626b;
}

.progress-track {

    height: 9px;

    overflow: hidden;

    border-radius: 999px;

    background:
        #142440;

    margin-top: 9px;
}

.progress-value {

    height: 100%;

    border-radius: inherit;

    background:
        linear-gradient(
            90deg,
            #12d99f,
            #28edba
        );
}

/* ========================================
   Mint
======================================== */

.mint-address {

    padding:
        18px;

    border-radius: 9px;

    background:
        #07132a;

    border:
        1px solid
        rgba(81, 122, 190, .32);

    color: #d9e4fa;

    font-family:
        Consolas,
        monospace;

    font-size: 13px;

    word-break: break-all;

    line-height: 1.7;
}

.explorer-button {

    width: 100%;

    margin-top: 15px;

    padding: 13px;

    border-radius: 8px;

    color: #dce8ff;

    text-align: center;

    text-decoration: none;

    background:
        rgba(12, 29, 57, .75);

    border:
        1px solid
        rgba(88, 129, 196, .45);

    font-size: 13px;
}

.explorer-button:hover {

    color: #fff;

    background:
        rgba(23, 52, 94, .8);
}

/* ========================================
   Tables
======================================== */

.tables-grid {

    display: grid;

    grid-template-columns:
        1fr 1fr 1fr;

    gap: 18px;

    margin-top: 18px;
}

.table-wrap {

    overflow-x: auto;
}

table {

    width: 100%;

    border-collapse: collapse;

    font-size: 12px;
}

thead {

    background:
        rgba(15, 34, 66, .65);
}

th {

    padding:
        13px 15px;

    color: #748bb0;

    font-weight: 600;

    white-space: nowrap;

    text-align: left;
}

td {

    padding:
        13px 15px;

    color: #b8c6dc;

    border-top:
        1px solid
        rgba(67, 99, 148, .13);

    white-space: nowrap;
}

tr:hover td {

    background:
        rgba(31, 76, 133, .1);
}

.wallet-cell {

    font-family:
        Consolas,
        monospace;

    color: #c6d4ed;
}

.status-badge {

    display: inline-block;

    padding:
        4px 9px;

    border-radius: 999px;

    font-size: 10px;

    font-weight: 700;
}

.status-badge.success {

    color: #27e8ae;

    background:
        rgba(25, 224, 166, .1);
}

.status-badge.failed {

    color: #ff6870;

    background:
        rgba(255, 81, 95, .1);
}

.status-badge.available {

    color: #29dfab;

    background:
        rgba(22, 213, 160, .1);
}

.status-badge.warning {

    color: #f0d35f;

    background:
        rgba(240, 211, 95, .1);
}

.status-badge.limit {

    color: #ff6870;

    background:
        rgba(255, 81, 95, .1);
}

.table-link {

    color: #5caeff;

    text-decoration: none;

    font-weight: 600;
}

.table-link:hover {

    color: #9accff;
}

/* ========================================
   Footer
======================================== */

.footer {

    display: flex;

    justify-content: space-between;

    align-items: center;

    padding:
        25px 5px;

    color: #596d91;

    font-size: 11px;
}

/* ========================================
   Mobile
======================================== */

@media (max-width: 1100px) {

    .nav-links {

        gap: 15px;
    }

    .nav-links a {

        font-size: 12px;
    }

    .supply-layout {

        grid-template-columns:
            1fr;
    }

    .tables-grid {

        grid-template-columns:
            1fr;
    }
}

@media (max-width: 800px) {

    .top-nav {

        height: auto;

        padding:
            16px 20px;

        flex-wrap: wrap;

        gap: 15px;
    }

    .nav-links {

        order: 3;

        width: 100%;

        overflow-x: auto;

        justify-content: flex-start;
    }

    .nav-links a {

        padding:
            8px 0;

        white-space: nowrap;
    }

    .dashboard {

        width:
            calc(100% - 24px);
    }

    .hero {

        min-height: 560px;

        background-position:
            62% center;
    }

    .hero-content {

        width: 100%;

        min-height: 560px;

        padding:
            50px 28px;

        justify-content:
            flex-end;

        background:
            linear-gradient(
                180deg,
                rgba(2, 7, 18, .08),
                rgba(2, 7, 18, .85)
            );
    }

    .hero-title {

        font-size: 52px;

        letter-spacing: 4px;
    }

    .hero-en {

        font-size: 15px;

        letter-spacing: 5px;
    }

    .hero-buttons {

        flex-direction: column;
    }

    .hero-btn {

        width: 100%;
    }

    .stats-grid {

        grid-template-columns:
            1fr;
    }

    .section-grid {

        grid-template-columns:
            1fr;
    }

    .footer {

        flex-direction: column;

        gap: 8px;

        text-align: center;
    }
}

</style>

</head>

<body>

<!-- ========================================
     NAVBAR
======================================== -->

<nav class="top-nav">

    <a
        href="/"
        class="brand"
    >

        <img
            src="/genesis-copyright-hero.png"
            class="brand-mark"
            alt="Genesis Copyright"
        >

        <div class="brand-text">

            <div class="brand-cn">
                創世版權
            </div>

            <div class="brand-en">
                GENESIS COPYRIGHT
            </div>

        </div>

    </a>

    <div class="nav-links">

        <a
            href="/"
            class="active"
        >
            首頁
        </a>

        <a href="#statistics">
            數據統計
        </a>

        <a href="#records">
            領取紀錄
        </a>

        <a
            href="https://explorer.solana.com/address/${MINT_ADDRESS}?cluster=devnet"
            target="_blank"
        >
            區塊瀏覽器
        </a>

        <a href="#about">
            關於專案
        </a>

    </div>

    <div class="network-status">

        <span class="network-dot"></span>

        DEVNET

    </div>

</nav>

<!-- ========================================
     DASHBOARD
======================================== -->

<main class="dashboard">

    <!-- ========================================
         HERO
    ======================================== -->

    <section class="hero">

        <div class="hero-content">

            <div class="hero-kicker">
                BUILD · CREATE · OWN
                <br>
                ON SOLANA
            </div>

            <h1 class="hero-title">
                創世版權
            </h1>

            <div class="hero-en">
                GENESIS COPYRIGHT
            </div>

            <div class="hero-line"></div>

            <p class="hero-description">
                基於 Solana 區塊鏈的數位版權管理系統
            </p>

            <div class="hero-sub-description">
                讓創作被看見 · 讓版權有價值
            </div>

            <div class="hero-buttons">

                <a
                    href="https://t.me/csu41218163bot"
                    target="_blank"
                    class="hero-btn hero-btn-primary"
                >
                    ➤
                    &nbsp;
                    開啟 Telegram 機器人
                    &nbsp; →
                </a>

                <a
                    href="https://explorer.solana.com/address/${MINT_ADDRESS}?cluster=devnet"
                    target="_blank"
                    class="hero-btn hero-btn-secondary"
                >
                    🔗
                    &nbsp;
                    查看區塊鏈瀏覽器
                </a>

            </div>

        </div>

    </section>

    <!-- ========================================
         ANNOUNCEMENT
    ======================================== -->

    <section class="announcement">

        <div>

            <div class="announcement-title">

                <span>
                    📢
                </span>

                系統公告

            </div>

            <div class="announcement-text">

                <span style="color:#25e4a8;">
                    ●
                </span>

                系統目前正常運行，暫無重要公告。

            </div>

        </div>

        <div class="announcement-time">

            最後更新：
            ${new Date().toLocaleString(
                'zh-TW',
                {
                    timeZone:
                        'Asia/Taipei'
                }
            )}

        </div>

    </section>

    <!-- ========================================
         STATS
    ======================================== -->

    <section
        class="stats-grid"
        id="statistics"
    >

        <!-- WhiteList -->

        <div class="stat-card stat-blue">

            <div class="stat-top">

                <div class="stat-icon">
                    👥
                </div>

                <div>

                    <div class="stat-label">
                        白名單總人數
                    </div>

                    <div class="stat-number">
                        ${whitelist.length}
                    </div>

                    <div class="stat-en">
                        Total Whitelist
                    </div>

                </div>

            </div>

            <div class="stat-change">
                ↑ +0
            </div>

        </div>

        <!-- Airdrop -->

        <div class="stat-card stat-purple">

            <div class="stat-top">

                <div class="stat-icon">
                    🎁
                </div>

                <div>

                    <div class="stat-label">
                        總空投發放次數
                    </div>

                    <div class="stat-number">
                        ${totalAirdropCount}
                    </div>

                    <div class="stat-en">
                        Total Airdropped
                    </div>

                </div>

            </div>

            <div class="stat-change">
                ↑ +0
            </div>

        </div>

        <!-- Supply -->

        <div class="stat-card stat-green">

            <div class="stat-top">

                <div class="stat-icon">
                    ▱
                </div>

                <div>

                    <div class="stat-label">
                        鏈上即時剩餘總數量
                    </div>

                    <div class="stat-number">
                        ${currentSupply.toLocaleString()}
                    </div>

                    <div class="stat-en">
                        Token Supply
                    </div>

                </div>

            </div>

            <div class="stat-change">
                ↑ +0
            </div>

        </div>

    </section>

    <!-- ========================================
         SUPPLY + MINT
    ======================================== -->

    <section class="section-grid">

        <!-- Supply -->

        <div class="panel">

            <div class="panel-header">

                <div class="panel-title">

                    <span class="panel-title-icon">
                        ◉
                    </span>

                    Token Supply 統計

                </div>

            </div>

            <div class="panel-body">

                <div class="supply-layout">

                    <div>

                        <div class="donut">

                            <div class="donut-content">

                                <div class="donut-number">
                                    ${burnedPercentage.toFixed(2)}%
                                </div>

                                <div class="donut-label">
                                    已銷毀
                                </div>

                            </div>

                        </div>

                    </div>

                    <div class="supply-list">

                        <div class="supply-row">

                            <div class="supply-name">
                                🪙 初始供應量
                            </div>

                            <div class="supply-value">
                                ${INITIAL_SUPPLY.toLocaleString()}
                            </div>

                        </div>

                        <div class="supply-row">

                            <div class="supply-name">
                                🟢 目前供應量
                            </div>

                            <div class="supply-value green">
                                ${currentSupply.toLocaleString()}
                            </div>

                        </div>

                        <div class="supply-row">

                            <div class="supply-name">
                                🔥 累計銷毀量
                            </div>

                            <div class="supply-value red">
                                ${burnedAmount.toLocaleString()}
                            </div>

                        </div>

                        <div>

                            <div
                                style="
                                    display:flex;
                                    justify-content:space-between;
                                    color:#8093b7;
                                    font-size:12px;
                                "
                            >

                                <span>
                                    Supply（剩餘）
                                </span>

                                <span
                                    style="color:#27e1ab;"
                                >
                                    ${supplyPercentage.toFixed(2)}%
                                </span>

                            </div>

                            <div class="progress-track">

                                <div
                                    class="progress-value"
                                    style="
                                        width:${supplyPercentage}%;
                                    "
                                ></div>

                            </div>

                        </div>

                    </div>

                </div>

            </div>

        </div>

        <!-- Mint -->

        <div class="panel">

            <div class="panel-header">

                <div class="panel-title">

                    <span class="panel-title-icon">
                        ◎
                    </span>

                    代幣合約地址
                    (Mint Address)

                </div>

            </div>

            <div class="panel-body">

                <div class="mint-address">
                    ${MINT_ADDRESS}
                </div>

                <a
                    href="https://explorer.solana.com/address/${MINT_ADDRESS}?cluster=devnet"
                    target="_blank"
                    class="explorer-button"
                >
                    ◎
                    &nbsp;
                    在 Solana Explorer 中查看
                    ↗
                </a>

            </div>

        </div>

    </section>

    <!-- ========================================
         TABLES
    ======================================== -->

    <section
        class="tables-grid"
        id="records"
    >

        <!-- Participants -->

        <div class="panel">

            <div class="panel-header">

                <div class="panel-title">

                    <span class="panel-title-icon">
                        ◉
                    </span>

                    參與者領取紀錄與狀態

                </div>

            </div>

            <div class="table-wrap">

                <table>

                    <thead>

                        <tr>

                            <th>
                                錢包地址
                            </th>

                            <th>
                                已領取
                            </th>

                            <th>
                                狀態
                            </th>

                            <th>
                                操作
                            </th>

                        </tr>

                    </thead>

                    <tbody>

                        ${
                            historyRows ||
                            `
                            <tr>
                                <td
                                    colspan="4"
                                    style="
                                        text-align:center;
                                        color:#667b9e;
                                        padding:30px;
                                    "
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

        <!-- Airdrops -->

        <div class="panel">

            <div class="panel-header">

                <div class="panel-title">

                    <span class="panel-title-icon">
                        🎁
                    </span>

                    最近空投交易

                </div>

            </div>

            <div class="table-wrap">

                <table>

                    <thead>

                        <tr>

                            <th>
                                時間
                            </th>

                            <th>
                                錢包
                            </th>

                            <th>
                                數量
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
                                    style="
                                        text-align:center;
                                        color:#667b9e;
                                        padding:30px;
                                    "
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

        <!-- Burn -->

        <div class="panel">

            <div class="panel-header">

                <div class="panel-title">

                    <span class="panel-title-icon">
                        🔥
                    </span>

                    最近代幣銷毀

                </div>

            </div>

            <div class="table-wrap">

                <table>

                    <thead>

                        <tr>

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
                            burnRows ||
                            `
                            <tr>
                                <td
                                    colspan="4"
                                    style="
                                        text-align:center;
                                        color:#667b9e;
                                        padding:30px;
                                    "
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

    </section>

    <!-- ========================================
         ABOUT
    ======================================== -->

    <section
        class="panel"
        id="about"
        style="margin-top:18px;"
    >

        <div class="panel-header">

            <div class="panel-title">

                <span class="panel-title-icon">
                    ✦
                </span>

                關於創世版權

            </div>

        </div>

        <div class="panel-body">

            <p
                style="
                    color:#a7b6cf;
                    line-height:1.9;
                    margin:0;
                    font-size:13px;
                "
            >

                創世版權（GENESIS COPYRIGHT）
                為基於 Solana 區塊鏈所建立的數位版權管理展示系統，
                透過區塊鏈技術記錄代幣、空投與銷毀資訊，
                展示數位資產與版權管理的實際應用。

            </p>

        </div>

    </section>

    <!-- ========================================
         FOOTER
    ======================================== -->

    <footer class="footer">

        <div>
            © 2026 創世版權 Genesis Copyright.
            正修科技大學資訊工程系畢業專題展示系統
        </div>

        <div>
            Built on Solana
            &nbsp;∞&nbsp;
            For a more open creative future.
        </div>

    </footer>

</main>

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
// 啟動
// ========================================

app.listen(PORT, () => {

    console.log(
        '=================================================='
    );

    console.log(
        '🌐 Genesis Copyright Dashboard 已啟動'
    );

    console.log(
        `👉 http://localhost:${PORT}`
    );

    console.log(
        '=================================================='
    );
});