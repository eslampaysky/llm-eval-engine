import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)
        ctx = await b.new_context(record_video_dir="/tmp/vid", viewport={"width": 1280, "height": 720})
        page = await ctx.new_page()
        print("Visiting google.com")
        await page.goto("https://www.google.com")
        print("page.goto finished. Getting video path...")
        try:
            # Let's see if this hangs
            if page.video:
                vp = await page.video.path()
                print("Got video path:", vp)
            else:
                print("No video object")
        except Exception as e:
            print("Error getting video path:", e)
        print("Closing context...")
        await ctx.close()
        print("Closing browser...")
        await b.close()
        print("All done.")

asyncio.run(run())
