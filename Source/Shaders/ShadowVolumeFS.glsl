#extension GL_EXT_frag_depth : enable

// emulated noperspective
varying float v_WindowZ;
varying vec4 v_color;

void writeDepthClampedToFarPlane()
{
    gl_FragDepthEXT = min(v_WindowZ * gl_FragCoord.w, 1.0);
}

void main(void)
{
    float minDist = 1000.0;
    float maxDist = 2500.0;
    
    vec2 coords = gl_FragCoord.xy / czm_viewport.zw;
    float depth = czm_unpackDepth(texture2D(czm_globeDepthTexture, coords));
    
    float dist = depth * (czm_currentFrustum.y - czm_currentFrustum.x) + czm_currentFrustum.x;
    
    //dist = clamp(dist, minDist, maxDist);
    
    float mixAlpha = (dist - minDist) / (maxDist - minDist);
    float alpha = clamp(mix(v_color.a, 0.0, mixAlpha), 0.0, v_color.a);
    
    gl_FragColor = vec4(v_color.rgb, alpha);
    
    if (mixAlpha < 0.0) {
        gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
    } else if (mixAlpha > 1.0) {
        gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0);
    }
    
    if (depth < 0.0 || depth > 1.0) {
        gl_FragColor = vec4(0.0, 0.0, 1.0, 1.0);
    }
    
    writeDepthClampedToFarPlane();
}