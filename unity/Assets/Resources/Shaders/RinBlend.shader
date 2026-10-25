Shader "Dashing/RinBlend"
{
    Properties
    {
        _MainTex ("Frame A", 2D) = "white" {}
        _NextTex ("Frame B", 2D) = "white" {}
        _Mix ("Frame blend", Range(0,1)) = 0
        _Color ("Tint", Color) = (1,1,1,1)
        _Glow ("Burn rim", Color) = (1,0,0,0)
        _FlowA ("Forward correspondence", 2D) = "gray" {}
        _FlowB ("Backward correspondence", 2D) = "gray" {}
        _Motion ("Motion reconstruction", Float) = 0
        _FlowScale ("Original-pixel displacement to UV", Vector) = (0,0,0,0)
    }
    SubShader
    {
        Tags { "Queue"="Transparent" "RenderType"="Transparent" "IgnoreProjector"="True" }
        Cull Off Lighting Off ZWrite Off
        Blend One OneMinusSrcAlpha
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 3.0
            #include "UnityCG.cginc"
            struct appdata { float4 vertex:POSITION; float2 uv:TEXCOORD0; };
            struct v2f { float4 vertex:SV_POSITION; float2 uv:TEXCOORD0; };
            sampler2D _MainTex, _NextTex, _FlowA, _FlowB;
            float _Mix, _Motion;
            float4 _FlowScale;
            fixed4 _Color, _Glow;
            float4 _MainTex_TexelSize;
            v2f vert(appdata v) { v2f o; o.vertex=UnityObjectToClipPos(v.vertex); o.uv=v.uv; return o; }
            float2 displacement(sampler2D field,float2 uv)
            {
                float4 value=tex2D(field,uv);
                // Match maps use linear RG bytes centered exactly on 128, not sRGB.
                // Confidence rejection / spatial slope limits are baked offline.
                // Applying a per-pixel confidence mask here can itself fold the UVs.
                return ((value.rg*255-128)/127)*_FlowScale.xy;
            }
            fixed4 frame(sampler2D source,float2 uv)
            {
                // Sprites touching the cutout edge need transparent outside pixels;
                // clamp-to-edge alone stretches the last blade pixel into a streak.
                fixed inside=step(0,uv.x)*step(uv.x,1)*step(0,uv.y)*step(uv.y,1);
                return tex2D(source,uv)*inside;
            }
            fixed4 frag(v2f i):SV_Target
            {
                float2 uvA=i.uv,uvB=i.uv;
                if(_Motion>.5 && _Mix>.0001 && _Mix<.9999)
                {
                    uvA=i.uv-_Mix*displacement(_FlowA,i.uv);
                    uvB=i.uv-(1-_Mix)*displacement(_FlowB,i.uv);
                    // One inverse-map refinement aligns both images at the subframe.
                    uvA=i.uv-_Mix*displacement(_FlowA,uvA);
                    uvB=i.uv-(1-_Mix)*displacement(_FlowB,uvB);
                }
                fixed4 a=frame(_MainTex,uvA), b=frame(_NextTex,uvB);
                // Blend premultiplied pixels in a single pass; do not fade the body twice.
                a.rgb*=a.a; b.rgb*=b.a;
                fixed4 c=lerp(a,b,_Mix);
                fixed halo=0;
                if(_Glow.a>.001)
                {
                float2 d=_MainTex_TexelSize.xy*2;
                fixed edge=0;
                edge+=lerp(frame(_MainTex,uvA+float2(d.x,0)).a,frame(_NextTex,uvB+float2(d.x,0)).a,_Mix);
                edge+=lerp(frame(_MainTex,uvA-float2(d.x,0)).a,frame(_NextTex,uvB-float2(d.x,0)).a,_Mix);
                edge+=lerp(frame(_MainTex,uvA+float2(0,d.y)).a,frame(_NextTex,uvB+float2(0,d.y)).a,_Mix);
                edge+=lerp(frame(_MainTex,uvA-float2(0,d.y)).a,frame(_NextTex,uvB-float2(0,d.y)).a,_Mix);
                halo=saturate(edge*.5-c.a)*_Glow.a*_Color.a;
                }
                c.rgb*=_Color.rgb*_Color.a; c.a*=_Color.a;
                c.rgb+=_Glow.rgb*halo*(1-c.a);c.a+=halo*(1-c.a);
                return c;
            }
            ENDCG
        }
    }
}
