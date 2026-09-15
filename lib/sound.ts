// Мэдэгдлийн дууг Web Audio-аар шууд синтезлэнэ — гадаад аудио файл татах, хадгалах шаардлагагүй.
// Client компонентоос аюулгүй import хийхийн тулд энд байрлана (lib/settings.ts нь server-only DB код агуулдаг).
export const soundPresets:Record<string,string>={none:'Дуугүй',chime:'Хонх (өгсөх)',ping:'Богино дохио',alert:'Гурван товч дохио',bell:'Гүн хонх'};
function tone(ctx:AudioContext,freq:number,start:number,duration:number,gain=0.2){
 const osc=ctx.createOscillator(),g=ctx.createGain();
 osc.type='sine';osc.frequency.value=freq;
 g.gain.setValueAtTime(0.0001,ctx.currentTime+start);
 g.gain.exponentialRampToValueAtTime(gain,ctx.currentTime+start+0.01);
 g.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+start+duration);
 osc.connect(g);g.connect(ctx.destination);
 osc.start(ctx.currentTime+start);osc.stop(ctx.currentTime+start+duration+0.05);
}
export function playNotificationSound(preset:string){
 if(preset==='none'||typeof window==='undefined')return;
 try{
  const Ctx=window.AudioContext||(window as unknown as {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
  if(!Ctx)return;
  const ctx=new Ctx();
  if(preset==='chime'){tone(ctx,880,0,0.18);tone(ctx,1318.5,0.15,0.28);}
  else if(preset==='ping'){tone(ctx,1200,0,0.14);}
  else if(preset==='alert'){tone(ctx,700,0,0.09);tone(ctx,700,0.15,0.09);tone(ctx,700,0.3,0.13);}
  else if(preset==='bell'){tone(ctx,523.25,0,0.7,0.22);tone(ctx,783.99,0,0.7,0.1);}
  setTimeout(()=>{void ctx.close();},1200);
 }catch{}
}
