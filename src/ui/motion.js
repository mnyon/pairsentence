const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const motionNames = { resonance:'共振', sparks:'星火', bloom:'生长', flip:'翻页', none:'静谧' };
export function motionPreference() {
  try { const value=localStorage.getItem('pairsentence-motion'); return Object.hasOwn(motionNames,value) ? value : 'resonance'; } catch { return 'resonance'; }
}
export function saveMotion(value) { try { localStorage.setItem('pairsentence-motion',value); } catch {} }
let running = false;
export async function playMotion(stage, mode, action='link', preview=false) {
  if (running || !stage.querySelector('.paragraph-card')) return;
  if (reducedMotion() || mode === 'none') return;
  running = true;
  const layer = document.createElement('div'); layer.className=`motion-layer motion-${mode}`; layer.setAttribute('aria-hidden','true');
  const animations=[];
  const run=(el,frames,options) => { const a=el.animate(frames,{fill:'both',...options}); animations.push(a); return a; };
  const duration = action==='link' ? 1050 : 340;
  const cards=[...stage.querySelectorAll('.paragraph-card')];
  try {
    stage.append(layer);
    if (action !== 'link') {
      cards.forEach((card,i)=>run(card,[{transform:'translateX(0)',opacity:1},{transform:`translateX(${(i===0?-1:1)*(action==='reject'?14:5)}px) translateY(${action==='skip'?-10:0}px)`,opacity:.45}],{duration:300,easing:'ease-in-out'}));
    } else if(mode==='flip') {
      // A book-like turn, deliberately distinct from the central particle effects.
      cards.forEach((card,i)=>run(card,[
        {transform:'perspective(900px) rotateY(0deg)',opacity:1},
        {transform:`perspective(900px) rotateY(${i===0?-72:72}deg) translateY(-8px)`,opacity:.35,offset:.45},
        {transform:'perspective(900px) rotateY(0deg)',opacity:1}
      ],{duration:1000,delay:i*90,easing:'cubic-bezier(.4,0,.2,1)'}));
      const ribbon=document.createElement('div');
      ribbon.style.cssText='position:absolute;left:10%;right:10%;top:45%;padding:14px 20px;text-align:center;background:var(--paper);color:var(--ink);border:1px solid var(--line);border-radius:8px;font-family:var(--serif);box-shadow:0 8px 30px #0002;';
      ribbon.textContent=preview?'翻过一页，看见新的联系。':'这一页，记下了新的联系。';layer.append(ribbon);
      run(ribbon,[{transform:'scaleX(0)',opacity:0},{transform:'scaleX(1)',opacity:1,offset:.45},{opacity:1,offset:.75},{transform:'translateY(-12px)',opacity:0}],{duration:1100,easing:'ease-in-out'});
    } else {
      layer.innerHTML='<div class="connection-glow"></div><svg class="motion-thread" viewBox="0 0 1000 200" preserveAspectRatio="none"><path class="thread-shadow" d="M 170 100 C 340 100 350 100 500 100 S 660 100 830 100"/><path class="thread-main" pathLength="1" d="M 170 100 C 340 100 350 100 500 100 S 660 100 830 100"/></svg><div class="motion-seal">✦</div>';
      const seal=layer.querySelector('.motion-seal');
      run(seal,[{transform:'translate(-50%,-50%) scale(0) rotate(-90deg)',opacity:0},{transform:'translate(-50%,-50%) scale(1.2) rotate(10deg)',opacity:1,offset:.42},{transform:'translate(-50%,-50%) scale(1) rotate(0)',opacity:1,offset:.7},{transform:'translate(-50%,-50%) scale(.7)',opacity:0}],{duration,easing:'cubic-bezier(.2,.8,.2,1)'});
      const thread=layer.querySelector('.thread-main');
      run(thread,[{strokeDasharray:'1',strokeDashoffset:1,opacity:0},{strokeDasharray:'1',strokeDashoffset:0,opacity:1,offset:.4},{strokeDasharray:'1',strokeDashoffset:0,opacity:1,offset:.8},{strokeDasharray:'1',strokeDashoffset:0,opacity:0}],{duration,easing:'ease-out'});
      run(layer.querySelector('.connection-glow'),[{opacity:0,transform:'translate(-50%,-50%) scale(.25)'},{opacity:.8,transform:'translate(-50%,-50%) scale(1)',offset:.5},{opacity:0,transform:'translate(-50%,-50%) scale(1.3)'}],{duration});
      cards.forEach((card,i)=>run(card,[{transform:'translateX(0) scale(1)'},{transform:`translateX(${i===0?5:-5}px) scale(1.012)`,offset:.35},{transform:'translateX(0) scale(1)'}],{duration:800,easing:'cubic-bezier(.2,.8,.2,1)'}));
      if(mode==='resonance') {
        for(let i=0;i<3;i++) { const ring=document.createElement('span'); ring.className='resonance-ring'; layer.append(ring); run(ring,[{transform:'translate(-50%,-50%) scale(.2)',opacity:0},{opacity:.65,offset:.15},{transform:'translate(-50%,-50%) scale(2.6)',opacity:0}],{duration:850,delay:i*90,easing:'ease-out'}); }
      } else if(mode==='sparks') {
        for(let i=0;i<22;i++) { const particle=document.createElement('span'); particle.className='spark-particle'; particle.textContent=i%4===0?'✦':'·'; layer.append(particle); const angle=i*2.39996, r=48+(i%5)*18; run(particle,[{transform:'translate(-50%,-50%) scale(0)',opacity:0},{opacity:1,offset:.2},{transform:`translate(calc(-50% + ${Math.cos(angle)*r}px),calc(-50% + ${Math.sin(angle)*r}px)) rotate(${i*31}deg) scale(${i%3===0?1.2:.8})`,opacity:0}],{duration:800,delay:(i%4)*45,easing:'cubic-bezier(.1,.8,.3,1)'}); }
      } else if(mode==='bloom') {
        for(let i=0;i<10;i++) { const leaf=document.createElement('span'); leaf.className='bloom-leaf'; layer.append(leaf); const direction=i%2===0?-1:1, x=direction*(30+Math.floor(i/2)*32), y=(i%3-1)*31; run(leaf,[{transform:`translate(-50%,-50%) rotate(${direction*35}deg) scale(0)`,opacity:0},{opacity:.9,offset:.35},{transform:`translate(calc(-50% + ${x}px),calc(-50% + ${y}px)) rotate(${direction*(35+i*7)}deg) scale(1)`,opacity:0}],{duration:850,delay:Math.floor(i/2)*35,easing:'cubic-bezier(.2,.8,.2,1)'}); }
      }
      const caption=document.createElement('div'); caption.className='motion-caption'; caption.textContent=preview?'一次联想，一点新的可能。':'两个想法，有了新的回声。'; layer.append(caption);
      run(caption,[{opacity:0,transform:'translate(-50%,8px)'},{opacity:1,transform:'translate(-50%,0)',offset:.35},{opacity:1,offset:.75},{opacity:0,transform:'translate(-50%,-5px)'}],{duration});
    }
    await Promise.all(animations.map(a=>a.finished.catch(()=>{})));
  } finally { animations.forEach(a=>a.cancel()); layer.remove(); running=false; }
}
