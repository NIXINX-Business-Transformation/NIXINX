import { ImageResponse } from 'next/og';
export const size = { width: 512, height: 512 };
export const contentType = 'image/png';
export default function Icon(){return new ImageResponse(<div style={{display:'flex',width:'100%',height:'100%',alignItems:'center',justifyContent:'center',background:'#091923',borderRadius:96,color:'#f1ffff',fontFamily:'Arial',fontSize:290,fontWeight:800}}>N<span style={{color:'#55e4c6'}}>.</span></div>,size)}
