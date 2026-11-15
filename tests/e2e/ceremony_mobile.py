import asyncio, time
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width':390,'height':780})
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://localhost:3000'); await pg.wait_for_timeout(1200)
        await pg.click('text=Criar partida'); await pg.fill('input', 'Andre'); await pg.click('text=Criar sala')
        await pg.wait_for_timeout(600); await pg.click('text=Estou pronto'); await pg.wait_for_timeout(300); await pg.click('text=Iniciar partida')
        loc=pg.locator
        await pg.wait_for_timeout(1500); await pg.screenshot(path='/tmp/shots/m_board.png')
        async def has(s): return await loc(s).count()>0
        async def act():
            if await has('[data-testid=shop]'): await loc('[data-testid=shop-leave]').click(timeout=3000, force=True)
            elif await has('[data-testid=roll]'): await pg.keyboard.press('Space')
            elif await has('[data-testid^=die-]'): await loc('[data-testid=die-0]').click(timeout=3000, force=True)
            elif await has('[data-testid=tp]'): await loc('[data-testid=tp]').first.click(timeout=3000, force=True)
            elif await has('[data-testid=duel-target]'): await loc('[data-testid=duel-target]').first.click(timeout=3000, force=True)
            elif await has('[data-testid=buy-yes]'): await loc('[data-testid=buy-yes]').click(timeout=3000, force=True)
            elif await has('.prompt-msg') and 'caminho' in await loc('.prompt-msg').first.inner_text(timeout=1500): await pg.keyboard.press('ArrowRight')
        for i in range(8000):
            if await has('[data-testid=final]'): break
            try: await act()
            except Exception as e: errs.append('act: ' + str(e)[:80])  # o prompt pode sumir entre ver e clicar
            await pg.wait_for_timeout(40)
        t0=time.time()
        for name,at in [('m_cer_intro',1.0),('m_cer_susp',6.0),('m_cer_rev',10.0)]:
            await pg.wait_for_timeout(max(0,(at-(time.time()-t0))*1000)); await pg.screenshot(path=f'/tmp/shots/{name}.png')
        # pula passos até o ranking e depois o campeão
        for _ in range(40):
            if await has('.cer-rank'): break
            await pg.keyboard.press('Space'); await pg.wait_for_timeout(120)
        await pg.wait_for_timeout(6500); await pg.screenshot(path='/tmp/shots/m_rank.png')
        try: await pg.click('[data-testid=cer-skip]', timeout=4000)  # pode já ter terminado sozinha
        except Exception: pass
        await pg.wait_for_timeout(1500); await pg.screenshot(path='/tmp/shots/m_champ.png')
        info = await pg.evaluate("(() => { const g = window.__roomClient.state.game.game; return {awards:g.awards.map(a=>[a.id,a.winner,a.tieNote]), final:g.final} })()")
        print(info, errs[:3])
        # jogar novamente
        await pg.click('[data-testid=again]'); await pg.wait_for_timeout(800)
        print('voltou ao lobby:', await pg.locator('text=Estou pronto').count()>0)
        await b.close()
asyncio.run(main())
