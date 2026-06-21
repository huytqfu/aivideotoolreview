const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');

async function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download: ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve(fs.statSync(destPath).size);
            });
        }).on('error', (err) => {
            fs.unlink(destPath, () => {});
            reject(err);
        });
    });
}

(async () => {
    console.log("Launching browser...");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    // Set custom user agent and viewport
    await page.setViewportSize({ width: 1280, height: 1000 });
    
    console.log("Navigating to Notion...");
    await page.goto('https://cord-wall-f76.notion.site/Submagic-Brand-Assets-1c33be939b9f800a9b92e0ecdd9c5566', {
        waitUntil: 'networkidle'
    });
    
    console.log("Initial page loaded. Waiting 10s for dynamic content...");
    await page.waitForTimeout(10000);
    
    // Scroll down slowly
    console.log("Scrolling page...");
    for (let i = 0; i < 5; i++) {
        await page.evaluate(() => window.scrollBy(0, 800));
        await page.waitForTimeout(2000);
    }
    
    console.log("Page scrolled. Waiting another 5s...");
    await page.waitForTimeout(5000);
    
    // Capture screenshot to check visual state
    const screenshotPath = path.join(__dirname, 'notion_loaded.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Saved page screenshot to ${screenshotPath}`);
    
    // Extract page content
    const bodyText = await page.evaluate(() => document.body.innerText);
    fs.writeFileSync(path.join(__dirname, 'page_text.txt'), bodyText);
    
    const html = await page.content();
    fs.writeFileSync(path.join(__dirname, 'page_html.html'), html);
    
    // Parse links and images
    const assets = await page.evaluate(() => {
        const results = [];
        
        // Find all links
        document.querySelectorAll('a').forEach(a => {
            results.push({
                type: 'link',
                href: a.href,
                text: a.innerText.trim()
            });
        });
        
        // Find all images
        document.querySelectorAll('img').forEach(img => {
            results.push({
                type: 'image',
                src: img.src,
                alt: img.alt || ''
            });
        });
        
        // Find video or source tags
        document.querySelectorAll('video source').forEach(src => {
            results.push({
                type: 'video_source',
                src: src.src
            });
        });
        
        document.querySelectorAll('video').forEach(video => {
            results.push({
                type: 'video',
                src: video.src
            });
        });
        
        return results;
    });
    
    console.log(`Found ${assets.length} raw assets on page.`);
    
    // Save raw assets description to JSON
    fs.writeFileSync(path.join(__dirname, 'assets_found.json'), JSON.stringify(assets, null, 2));
    
    // Filter and display important ones
    const interestingAssets = assets.filter(item => {
        const url = item.href || item.src || '';
        return url.includes('amazonaws.com') || url.includes('drive.google.com') || url.includes('dropbox.com') || url.includes('submagic') || url.includes('notion');
    });
    
    console.log("\n--- INTERESTING ASSETS FOUND ---");
    interestingAssets.forEach(item => {
        console.log(JSON.stringify(item));
    });
    
    // Try to find the logo
    // Let's look for images containing "logo" or "Logo_Bord_Arrondis" or specific names
    let logoUrl = null;
    let screenshotUrls = [];
    
    for (const asset of assets) {
        const url = asset.src || asset.href || '';
        if (asset.type === 'image') {
            if (url.includes('Logo') || url.includes('logo')) {
                logoUrl = url;
            } else if (url.includes('amazonaws') && !url.includes('notion-emojis') && !url.includes('Update_Feb_2025')) {
                screenshotUrls.push(url);
            }
        }
    }
    
    console.log(`\nDetected logo: ${logoUrl}`);
    console.log(`Detected screenshots:`, screenshotUrls);
    
    // Create assets directory
    const assetsDir = path.join(__dirname, 'assets');
    if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
    }
    
    // Download files
    if (logoUrl) {
        try {
            console.log(`Downloading logo: ${logoUrl}`);
            const size = await downloadFile(logoUrl, path.join(assetsDir, 'submagic_logo.png'));
            console.log(`Downloaded logo, size: ${size} bytes`);
        } catch (err) {
            console.error(`Failed to download logo: ${err.message}`);
        }
    }
    
    for (let i = 0; i < Math.min(2, screenshotUrls.length); i++) {
        try {
            const sUrl = screenshotUrls[i];
            console.log(`Downloading screenshot ${i+1}: ${sUrl}`);
            const size = await downloadFile(sUrl, path.join(assetsDir, `screenshot_ui_${i+1}.png`));
            console.log(`Downloaded screenshot ${i+1}, size: ${size} bytes`);
        } catch (err) {
            console.error(`Failed to download screenshot ${i+1}: ${err.message}`);
        }
    }
    
    await browser.close();
    console.log("Done.");
})();
