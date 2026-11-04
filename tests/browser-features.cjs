// Run with NODE_PATH pointing to an installation of playwright.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({viewport:{width:390,height:844}});
  const errors=[]; page.on('pageerror', e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/');
  console.log('Loaded');
  await page.evaluate(async()=>{ await QRTabs.loadScript('libs/jsQR.js'); });
  for (const [type,data,expected] of [['email','test+tag@example.com','mailto:test%2Btag@example.com?subject=Hello%20%26%20%E4%B8%AD%E6%96%87&body=Line%201%0ALine%202'],['phone','+886 912-345-678','tel:+886912345678'],['sms','+886 912-345-678','sms:+886912345678?body=Line%201%0ALine%202']]) {
    const decoded=await page.evaluate(({type,data})=>{
      document.querySelector(`[name="qi-type"][value="${type}"]`).checked=true;
      document.getElementById(type==='email'?'qi-data':'qi-phone').value=data;
      document.getElementById('qi-subject').value='Hello & 中文';
      document.getElementById('qi-body').value='Line 1\nLine 2';
      updateTypeFields(); renderQuick();
      const c=quickQr.canvas, image=c.getContext('2d').getImageData(0,0,c.width,c.height);
      return jsQR(image.data,image.width,image.height).data;
    },{type,data});
    assert.equal(decoded,expected);
    console.log('Decoded',type);
  }
  const vcard=await page.evaluate(()=>{
    document.querySelector('[name="qi-type"][value="vcard"]').checked=true;
    document.getElementById('qi-contact-family').value='王';
    document.getElementById('qi-contact-given').value='小明;測試';
    document.getElementById('qi-contact-org').value='公司,研發';
    updateTypeFields(); renderQuick();
    const c=quickQr.canvas, image=c.getContext('2d').getImageData(0,0,c.width,c.height);
    return jsQR(image.data,image.width,image.height).data;
  });
  assert(vcard.includes('N:王;小明\\;測試;;;\r\nFN:王小明\\;測試\r\nORG:公司\\,研發'));
  console.log('Decoded vcard');
  const styled=await page.evaluate(async()=>{
    document.querySelector('[name="qi-type"][value="url"]').checked=true;
    document.getElementById('qi-data').value='https://example.com';
    document.getElementById('opt-foreground').value='#123456';
    document.getElementById('opt-background').value='#fff5e0';
    const mark=document.createElement('canvas'); mark.width=mark.height=32;
    const ctx=mark.getContext('2d'); ctx.fillStyle='red'; ctx.fillRect(0,0,32,32);
    const blob=await new Promise(r=>mark.toBlob(r)); await QRExtras.setLogo(new File([blob],'logo.png',{type:'image/png'}));
    updateTypeFields(); renderQuick();
    const c=quickQr.canvas, image=c.getContext('2d').getImageData(0,0,c.width,c.height);
    const decoded=jsQR(image.data,image.width,image.height)?.data;
    const png=Array.from(image.data.slice(0,3));
    const svg=quickQr.svg;
    const pdf=new TextDecoder().decode(QRExtras.pdf(quickQr));
    document.querySelector('[name="opt-fmt"][value="SVG"]').checked=true;
    document.getElementById('qi-caption').value='中文標籤'; renderQuick();
    const svgCaption=quickQr.svg;
    const result={decoded,png,svg,pdf,svgCaption};
    await QRExtras.setLogo(null); return result;
  });
  assert.equal(styled.decoded,'https://example.com'); assert.deepEqual(styled.png,[255,245,224]);
  assert(styled.svg.includes('<image href="data:image/png;')); assert(styled.svg.includes('#123456'));
  assert(styled.pdf.startsWith('%PDF-1.4')); assert(styled.svgCaption.includes('fill-rule="evenodd"'));
  console.log('Styled exports');
  await page.evaluate(async()=>{
    await QRTabs.loadScript('libs/bwip-js.min.js');
    const c=document.createElement('canvas'); bwipjs.toCanvas(c,{bcid:'code128',text:'QRForge-12345',scale:3,height:18,includetext:true});
    window.testBarcode=c.toDataURL();
  });
  const barcode=await page.evaluate(()=>Array.from(Uint8Array.from(atob(testBarcode.split(',')[1]),c=>c.charCodeAt(0))));
  await page.locator('.tabs [data-tab="scan"]').click();
  await page.locator('#scan-file').setInputFiles({name:'barcode.png',mimeType:'image/png',buffer:Buffer.from(barcode)});
  await page.waitForFunction(()=>document.getElementById('scan-results').textContent.includes('QRForge-12345'),null,{timeout:20000});
  for (const [bcid,text,rotated] of [['ean13','5901234123457'],['code39','QRFORGE'],['datamatrix','Matrix-123'],['code39','ROTATED123',true]]) {
    console.log('Scanning',bcid);
    const bytes=await page.evaluate(({bcid,text,rotated})=>{
      let canvas=document.createElement('canvas'); bwipjs.toCanvas(canvas,{bcid,text,scale:3,height:18,backgroundcolor:'FFFFFF'});
      if (rotated) {
        const target=document.createElement('canvas'); target.width=canvas.height; target.height=canvas.width;
        const ctx=target.getContext('2d'); ctx.translate(target.width,0); ctx.rotate(Math.PI/2); ctx.drawImage(canvas,0,0); canvas=target;
      }
      return Array.from(Uint8Array.from(atob(canvas.toDataURL().split(',')[1]),c=>c.charCodeAt(0)));
    },{bcid,text,rotated});
    await page.locator('#scan-file').setInputFiles({name:bcid+'.png',mimeType:'image/png',buffer:Buffer.from(bytes)});
    await page.waitForFunction(text=>document.getElementById('scan-results').textContent.includes(text),text,{timeout:20000});
  }
  await page.goto('http://127.0.0.1:8765/?share_title=Example&share_url=https%3A%2F%2Fexample.com');
  assert.equal(await page.locator('#qi-data').inputValue(),'https://example.com');
  assert.equal(await page.locator('[name="qi-type"]:checked').inputValue(),'url');
  assert(!page.url().includes('share_url'));
  // Label export must include readable PDF output and caption paths.
  await page.evaluate(async()=>{
    QRTabs.select('batch'); await addResult('測試標籤','https://example.com');
    document.getElementById('label-caption-mode').value='filename';
  });
  await page.locator('input[name="batch-output"][value="print"]').check({force:true});
  const download=page.waitForEvent('download'); await page.locator('#label-btn').click();
  const file=await download; assert(file.suggestedFilename().endsWith('.pdf'));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth), 'Mobile label menu must fit the viewport');
  await page.evaluate(async()=>{
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
  });
  const redirect=await page.evaluate(async(bytes)=>{
    const form=new FormData();
    form.append('files',new File([Uint8Array.from(bytes)],'shared-barcode.png',{type:'image/png'}));
    const response=await fetch('./share-target',{method:'POST',body:form});
    return response.url;
  },barcode);
  assert(redirect.includes('share_id='));
  await page.context().setOffline(true);
  await page.goto(redirect);
  await page.waitForFunction(()=>document.getElementById('scan-results').textContent.includes('QRForge-12345'));
  assert.equal(await page.evaluate(()=>QRTabs.current()),'scan');
  assert(!page.url().includes('share_id'));
  await page.context().setOffline(false);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:require('node:os').tmpdir()+'/qrforge-features.png',fullPage:true});
  await browser.close(); console.log('PASS: payload decode, vCard escaping, color/logo, SVG captions, PDF export, barcode scan, inbound text/link/image share, offline reception, label download, mobile menu, no runtime errors');
})().catch(e=>{console.error(e);process.exit(1)});
