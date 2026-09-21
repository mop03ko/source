// Хуудас сервер дээр бэлдэгдэж байх хооронд харагдах брэндийн preloader. Энэ үед React хараахан
// ачаалагдаагүй байдаг тул зөвхөн CSS-ээр эргэдэг цагираг ашиглана (.spin нь globals.css-д бий).
export function Preloader({label='Ажлын орчныг бэлдэж байна…'}:{label?:string}){
 return <div role="status" aria-live="polite" style={{position:'fixed',inset:0,zIndex:50,display:'grid',placeItems:'center',background:'#f7f7fa'}}>
  <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:16}}>
   <div style={{position:'relative',display:'grid',placeItems:'center',width:76,height:76}}>
    <span className="spin" aria-hidden="true" style={{position:'absolute',inset:0,borderRadius:'50%',border:'3px solid #e7e1ee',borderTopColor:'#f68d2e'}}/>
    <div className="brandmark" style={{background:'#28153d',color:'#fff'}}>A<span/></div>
   </div>
   <strong style={{fontSize:20,color:'#251a34'}}>AntMall<span className="brand-dot">.</span></strong>
   <p style={{fontSize:13,color:'#6a5877',margin:0}}>{label}</p>
  </div>
 </div>;
}
