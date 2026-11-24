import {ImageResponse} from 'next/og';
const size={width:192,height:192};

export default function GET(){return new ImageResponse(<div style={{display:'flex',width:'100%',height:'100%',alignItems:'center',justifyContent:'center',background:'#18332f'}}><svg width="150" height="150" viewBox="0 0 64 64"><path d="M13 48V16h7l25 24V16h7v32h-7L20 24v24z" fill="#e1efec"/><path d="M20 24V16l32 31-7 1z" fill="#75d2b9"/><path d="M13 48l7-8 32-24v8L20 48z" fill="#4e9c88" opacity=".7"/></svg></div>,size)}
