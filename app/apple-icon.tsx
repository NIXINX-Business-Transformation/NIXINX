import { ImageResponse } from 'next/og';
export const size={width:180,height:180}; export const contentType='image/png';
export default function AppleIcon(){return new ImageResponse(<div style={{display:'flex',width:'100%',height:'100%',justifyContent:'center',alignItems:'center',background:'#091923',color:'#f1ffff',fontFamily:'Arial',fontSize:106,fontWeight:800}}>N<span style={{color:'#55e4c6'}}>.</span></div>,size)}
