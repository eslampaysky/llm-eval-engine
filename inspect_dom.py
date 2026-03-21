from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    
    print('=== SAUCEDEMO ====')
    page = browser.new_page()
    page.goto('https://www.saucedemo.com')
    time.sleep(2)
    try:
        htmls = page.evaluate('''
            Array.from(document.querySelectorAll("input[type=submit], button, [id*=login], [class*=login]"))
                 .map(e => e.outerHTML)
        ''')
        for h in htmls: print(h)
    except Exception as e: print(e)
    
    print('=== DEMOBLAZE ====')
    page = browser.new_page()
    page.goto('https://www.demoblaze.com/prod.html?idp_=1')
    time.sleep(3)
    try:
        htmls = page.evaluate('''
            Array.from(document.querySelectorAll("a, button"))
                 .filter(e => e.textContent.toLowerCase().includes("cart"))
                 .map(e => e.outerHTML)
        ''')
        for h in htmls: print(h)
    except Exception as e: print(e)
    
    browser.close()
