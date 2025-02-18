const puppeteer = require('puppeteer'); const fs = require('fs'); const path = require('path');

const BASE_URL = 'https://steamcommunity.com/market/search?appid=730'; const OUTPUT_FOLDER = 'market_data'; const COMBINED_JSON = path.join(OUTPUT_FOLDER, 'steam_market_combined.json');

if (!fs.existsSync(OUTPUT_FOLDER)) { fs.mkdirSync(OUTPUT_FOLDER); }

async function getCategories(page) { await page.goto(BASE_URL, { waitUntil: 'networkidle2' }); return await page.evaluate(() => { const categories = {}; document.querySelectorAll(".market_search_sidebar_section input[type='checkbox']").forEach(input => { const category = input.name.match(/category_730_(.*?)%5B/i); if (category && category[1]) { const type = category[1]; if (!categories[type]) categories[type] = []; categories[type].push(input.value); } }); return categories; }); }

async function scrapeCategory(page, category, value) { console.log(Scraping ${category}: ${value}...); const url = ${BASE_URL}&category_730_${category}%5B%5D=${value}; await page.goto(url, { waitUntil: 'networkidle2' }); await page.waitForTimeout(2000);

let items = [];
let currentPage = 1;

while (true) {
    console.log(`Page ${currentPage} for ${category}: ${value}`);
    const pageItems = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.market_listing_row')).map(item => {
            const name = item.querySelector('.market_listing_item_name')?.innerText.trim() || 'Unknown';
            const englishName = item.getAttribute('data-hash-name') || name;
            const priceElement = item.querySelector('.market_listing_their_price .normal_price');
            const price = priceElement ? priceElement.innerText.replace('$', '').trim() : '0.00';
            const quantityElement = item.querySelector('.market_listing_num_listings_qty');
            const quantity = quantityElement ? parseInt(quantityElement.innerText) || 0 : 0;
            const imgElement = item.querySelector('.market_listing_item_img');
            const imgUrl = imgElement ? imgElement.src : '';
            const itemLink = item.closest('a') ? item.closest('a').href : '';
            return { name, englishName, price, quantity, imgUrl, itemLink };
        });
    });

    items = [...items, ...pageItems];
    
    const nextButton = await page.$('.market_paging_controls .pagebtn:not(.disabled)');
    if (!nextButton) break;
    await nextButton.click();
    await page.waitForTimeout(3000);
    currentPage++;
}

fs.writeFileSync(path.join(OUTPUT_FOLDER, `steam_market_filter_${category}_${value}.json`), JSON.stringify(items, null, 2));
console.log(`Saved ${items.length} items for ${category}: ${value}`);

}

async function mergeJsonFiles() { console.log("Merging all JSON files..."); let combinedData = {}; const allFiles = fs.readdirSync(OUTPUT_FOLDER).filter(file => file.startsWith('steam_market_filter_'));

allFiles.forEach(file => {
    const data = JSON.parse(fs.readFileSync(path.join(OUTPUT_FOLDER, file), 'utf-8'));
    data.forEach(item => {
        if (!combinedData[item.englishName]) combinedData[item.englishName] = item;
    });
});

fs.writeFileSync(COMBINED_JSON, JSON.stringify(Object.values(combinedData), null, 2));
console.log(`Final merged data saved to ${COMBINED_JSON}`);

}

(async () => { const browser = await puppeteer.launch({ headless: false, slowMo: 100 }); const page = await browser.newPage(); const categories = await getCategories(page);

for (const [category, values] of Object.entries(categories)) {
    for (const value of values) {
        await scrapeCategory(page, category, value);
    }
}

await browser.close();
mergeJsonFiles();

})();

