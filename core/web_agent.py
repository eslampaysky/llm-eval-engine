import base64
import json
import re

from playwright.async_api import async_playwright


async def run_web_audit(url: str) -> dict:
    result = {
        "url": url,
        "status_code": None,
        "title": "",
        "nav_links": [],
        "buttons": [],
        "forms": [],
        "console_errors": [],
        "broken_links": [],
        "text_snippet": "",
        "screenshot_b64": None,
    }
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(
            record_video_dir="/tmp/aibreaker_videos/",
            record_video_size={"width": 1280, "height": 720},
        )
        page.on(
            "console",
            lambda m: result["console_errors"].append(m.text) if m.type == "error" else None,
        )
        try:
            r = await page.goto(url, timeout=20000, wait_until="networkidle")
            result["status_code"] = r.status
            result["title"] = await page.title()
            result["text_snippet"] = (await page.inner_text("body"))[:800]
            result["nav_links"] = await page.eval_on_selector_all(
                "nav a, header a",
                "els=>els.map(e=>({text:e.innerText,href:e.href}))",
            )
            result["buttons"] = await page.eval_on_selector_all(
                "button,[role='button'],input[type='submit'],input[type='button']",
                "els=>els.map(e=>e.innerText||e.value||'?')",
            )
            result["forms"] = await page.eval_on_selector_all(
                "form",
                "els=>els.map(e=>({id:e.id,action:e.action,fields:e.querySelectorAll('input').length}))",
            )
            screenshot_bytes = await page.screenshot(type="png")
            result["screenshot_b64"] = base64.b64encode(screenshot_bytes).decode("ascii")
        except Exception as e:
            result["error"] = str(e)
        finally:
            video_path = await page.video.path() if page.video else None
            result["video_path"] = str(video_path) if video_path else None
            await browser.close()
    return result
