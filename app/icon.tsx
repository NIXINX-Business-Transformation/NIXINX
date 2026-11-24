import {ImageResponse} from 'next/og';
export const size={width:512,height:512};
export const contentType='image/png';
export default function Icon(){return new ImageResponse(<div style={{display:'flex',width:'100%',height:'100%',alignItems:'center',justifyContent:'center',background:'#102522'}}><svg width="399" height="399" viewBox="0 0 64 64"><g fill="none" strokeWidth="9" strokeLinecap="round"><path d="M16 48V18" stroke="#87c6b8"/><path d="M48 46V16" stroke="#aaccc4"/><path d="M16 18L48 46" stroke="#e4f1ed"/></g></svg></div>,size)}
