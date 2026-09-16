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
let shared:AudioContext|null=null;
// Хөтөч бүр дуу хоолойг зөвхөн хэрэглэгчийн үйлдлийн дараа (click гэх мэт) тоглуулдаг тул context-оо
// давхар нээхийн оронд нэг л удаа үүсгэж, дараа нь suspended болсон бол resume хийж дахин ашиглана.
function context(){
 if(typeof window==='undefined')return null;
 const Ctx=window.AudioContext||(window as unknown as {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
 if(!Ctx)return null;
 if(!shared)shared=new Ctx();
 return shared;
}
export function playNotificationSound(preset:string){
 if(preset==='none')return;
 try{
  const ctx=context();if(!ctx)return;
  const play=()=>{
   if(preset==='chime'){tone(ctx,880,0,0.18);tone(ctx,1318.5,0.15,0.28);}
   else if(preset==='ping'){tone(ctx,1200,0,0.14);}
   else if(preset==='alert'){tone(ctx,700,0,0.09);tone(ctx,700,0.15,0.09);tone(ctx,700,0.3,0.13);}
   else if(preset==='bell'){tone(ctx,523.25,0,0.7,0.22);tone(ctx,783.99,0,0.7,0.1);}
  };
  if(ctx.state==='suspended')ctx.resume().then(play).catch(()=>{});
  else play();
 }catch{}
}
