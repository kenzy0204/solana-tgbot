const { Connection, Keypair, clusterApiUrl } = require('@solana/web3.js');
const { createUmi } = require('@metaplex-foundation/umi-bundle-defaults');
const { createAndMint, mplTokenMetadata, TokenStandard } = require('@metaplex-foundation/mpl-token-metadata');
const { fromWeb3JsKeypair } = require('@metaplex-foundation/umi-web3js-adapters');
const { createSignerFromKeypair, percentAmount } = require('@metaplex-foundation/umi');//---4/16新增
const bs58 = require('bs58').default;//---4/16新增
const fs = require('fs'); 

const umi = createUmi(clusterApiUrl("devnet")).use(mplTokenMetadata());

// 你的錢包私鑰
const PRIVATE_KEY = "5Vvph9aG6jBsz4seQ2837He2sd4GyQNCojAESqUUCayhqfrKQsZWncMu1E4UDEDdUQoce1CTDasCRu49WWUfxrct"; 
const myKeypair = Keypair.fromSecretKey(bs58.decode(PRIVATE_KEY));
const userWallet = createSignerFromKeypair(umi, fromWeb3JsKeypair(myKeypair));
umi.identity = userWallet;
umi.payer = userWallet;

(async () => {
    try {
        // --- 核心：讀取固定身分證檔案 ---
        console.log("正在讀取固定代幣金鑰 (mint-keypair.json)...");//-固定代幣位置 
        const secretKeyString = fs.readFileSync('./mint-keypair.json', 'utf8');
        const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
        const mintKeypair = umi.eddsa.createKeypairFromSecretKey(secretKey);
        const mint = createSignerFromKeypair(umi, mintKeypair);

        console.log(`🚀 準備發行固定地址代幣: ${mint.publicKey}`);

        await createAndMint(umi, {
            mint,
            name: "Creation Copyright",
            symbol: "CCT",        
            uri: "https://raw.githubusercontent.com/kenzy0204/memepng/main/metadata.json",
            sellerFeeBasisPoints: percentAmount(0),
            decimals: 9,
            amount: 1000000000 * Math.pow(10, 9), 
            tokenOwner: userWallet.publicKey,
            tokenStandard: TokenStandard.Fungible,
        }).sendAndConfirm(umi);

        console.log("\n--- 🎉 CCT 固定地址代幣發行成功！ ---");
        console.log(`✅ 代幣地址: ${mint.publicKey}`);
    } catch (e) {
        console.error("❌ 發生錯誤：", e.message);
    }
})();