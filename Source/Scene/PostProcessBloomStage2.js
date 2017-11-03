define([
        '../Core/Cartesian2',
        '../Core/defined',
        '../Core/defineProperties',
        '../Core/destroyObject',
        '../Core/Math',
        '../Shaders/PostProcessFilters/AdditiveBlend',
        '../Shaders/PostProcessFilters/BrightPass',
        '../Shaders/PostProcessFilters/GaussianBlur1D',
        '../Shaders/PostProcessFilters/PassThrough',
        './PostProcess',
        './PostProcessComposite',
        './PostProcessSampleMode'
    ], function(
        Cartesian2,
        defined,
        defineProperties,
        destroyObject,
        CesiumMath,
        AdditiveBlend,
        BrightPass,
        GaussianBlur1D,
        PassThrough,
        PostProcess,
        PostProcessComposite,
        PostProcessSampleMode) {
    'use strict';

    /**
     * Post process stage for bloom. Implements {@link PostProcess}.
     *
     * @alias PostProcessBloomStage
     * @constructor
     *
     * @private
     */
    function PostProcessBloomStage() {
        this._downsample = undefined;
        this._brightPass = undefined;
        this._blur = undefined;
        this._upsample = undefined;
        this._composite = undefined;

        this._blurStep = new Cartesian2();
        this._delta = 1.0;
        this._sigma = 2.0;

        this._threshold = 1.0;
        this._offset = 1.0;

        this._enabled = true;
    }

    defineProperties(PostProcessBloomStage.prototype, {
        ready : {
            get : function() {
                if (!defined(this._downsample)) {
                    return false;
                }
                var ready = this._downsample.ready && this._brightPass.ready && this._blur.ready;
                ready = ready && this._upsample.ready && this._composite.ready;
                return ready;
            }
        },
        enabled : {
            get : function() {
                return this._enabled;
            },
            set : function(value) {
                this._enabled = value;
            }
        },
        outputTexture : {
            get : function() {
                if (!defined(this._composite)) {
                    return undefined;
                }
                return this._composite.outputTexture;
            }
        }
    });

    function createStages(postProcess, context) {
        if (!postProcess._enabled || (defined(postProcess._downsample) && !defined(postProcess._downsample.outputTexture))) {
            return;
        }

        var width = context.drawingBufferWidth;
        var height = context.drawingBufferHeight;

        if (width !== height || !CesiumMath.isPowerOfTwo(width)) {
            width = Math.pow(2.0, Math.floor(Math.log(width) / Math.log(2)));
            height = Math.pow(2.0, Math.floor(Math.log(height) / Math.log(2)));
        }

        var size = Math.max(1.0, width, height);
        if (defined(postProcess._downsample)) {
            if (postProcess._downsample.outputTexture.width === size) {
                return;
            }
            postProcess._downsample.destroy();
            postProcess._brightPass.destroy();
            postProcess._blur.destroy();
            postProcess._upsample.destroy();
            postProcess._composite.destroy();
        }

        var numDownsamples = Math.floor(Math.log(size) / Math.log(2)) + 1;
        var downsamples = new Array(numDownsamples);
        for (var i = 0; i < numDownsamples; ++i) {
            downsamples[i] = new PostProcess({
                fragmentShader : PassThrough,
                forcePowerOfTwo : true,
                samplingMode : PostProcessSampleMode.LINEAR,
                textureScale : 1.0 / Math.pow(2.0, i)
            });
        }
        postProcess._downsample = new PostProcessComposite({
            processes : downsamples
        });

        postProcess._brightPass = new PostProcess({
            fragmentShader : '#define USE_LUMINANCE_TEXTURE\n' + BrightPass,
            forcePowerOfTwo : true,
            textureScale : 0.5,
            uniformValues : {
                threshold : postProcess._threshold,
                offset : postProcess._offset,
                luminanceTexture : function() {
                    return postProcess._downsample.outputTexture;
                }
            }
        });

        postProcess._blur = new PostProcessComposite({
            processes : [
                new PostProcess({
                    fragmentShader : GaussianBlur1D,
                    forcePowerOfTwo : true,
                    textureScale : 0.5,
                    uniformValues : {
                        step : function() {
                            postProcess._blurStep.x = postProcess._blurStep.y = 1.0 / postProcess._brightPass.outputTexture.width;
                            return postProcess._blurStep;
                        },
                        delta : function() {
                            return postProcess._delta;
                        },
                        sigma : function() {
                            return postProcess._sigma;
                        },
                        direction : 0.0
                    }
                }),
                new PostProcess({
                    fragmentShader : GaussianBlur1D,
                    forcePowerOfTwo : true,
                    textureScale : 0.5,
                    uniformValues : {
                        step : function() {
                            postProcess._blurStep.x = postProcess._blurStep.y = 1.0 / postProcess._brightPass.outputTexture.width;
                            return postProcess._blurStep;
                        },
                        delta : function() {
                            return postProcess._delta;
                        },
                        sigma : function() {
                            return postProcess._sigma;
                        },
                        direction : 1.0
                    }
                })]
        });

        postProcess._upsample = new PostProcess({
            fragmentShader : PassThrough,
            samplingMode : PostProcessSampleMode.LINEAR
        });

        postProcess._composite = new PostProcess({
            fragmentShader : AdditiveBlend,
            uniformValues : {
                colorTexture2 : function() {
                    return postProcess._upsample.outputTexture;
                }
            }
        });
    }

    PostProcessBloomStage.prototype.update = function(context) {
        createStages(this, context);

        this._downsample.enabled = this._enabled;
        this._brightPass.enabled = this._enabled;
        this._blur.enabled = this._enabled;
        this._upsample.enabled = this._enabled;
        this._composite.enabled = this._enabled;

        this._downsample.update(context);
        this._brightPass.update(context);
        this._blur.update(context);
        this._upsample.update(context);
        this._composite.update(context);
    };

    PostProcessBloomStage.prototype.clear = function(context) {
        this._downsample.clear(context);
        this._brightPass.clear(context);
        this._blur.clear(context);
        this._upsample.clear(context);
        this._composite.clear(context);
    };

    PostProcessBloomStage.prototype.execute = function(context, colorTexture, depthTexture) {
        this._downsample.execute(context, colorTexture, depthTexture);
        this._brightPass.execute(context, this._downsample.processes[1].outputTexture, depthTexture);
        this._blur.execute(context, this._brightPass.outputTexture, depthTexture);
        this._upsample.execute(context, this._blur.outputTexture, depthTexture);
        this._composite.execute(context, colorTexture, depthTexture);
    };

    PostProcessBloomStage.prototype.isDestroyed = function() {
        return false;
    };

    PostProcessBloomStage.prototype.destroy = function() {
        this._downsample = this._downsample && this._downsample.destroy();
        this._brightPass = this._brightPass && this._brightPass.destroy();
        this._blur = this._blur && this._blur.destroy();
        this._upsample = this._upsample && this._upsample.destroy();
        this._composite = this._composite && this._composite.destroy();
        return destroyObject(this);
    };

    return PostProcessBloomStage;
});
