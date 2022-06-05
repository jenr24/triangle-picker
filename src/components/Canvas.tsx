import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Container, Box, Slider, SliderMark, useSafeLayoutEffect, SliderTrack, SliderFilledTrack, SliderThumb, Center } from '@chakra-ui/react'

import { jsx, css, Global, ClassNames } from '@emotion/react'

import { CheckWebGPU } from '@/helper';
import { Shaders, Shaders1 } from '@/shaders';
import RGBASlider, { RGBA } from './RGBASlider';

type GPUState = {
    device: GPUDevice;
    context: GPUCanvasContext;
    format: GPUTextureFormat;
    vertexBuffer: GPUBuffer;
    colorBuffer: GPUBuffer;
};

type CanvasProps = {
    width: number,
    height: number,
}

const Canvas: React.FC<CanvasProps> = ({width, height}) => {

    const canvas = useRef<HTMLCanvasElement>(null);
    const [color, setColor] = useState(Float32Array.of(0.1, 0.8, 0.9, 1.0));
    const [gpu, setGpu] = useState<GPUState | undefined>(undefined);

    useEffect(() => {
        if(CheckWebGPU().includes('Your current browser does not support WebGPU!')){
            console.log(CheckWebGPU());
            throw('Your current browser does not support WebGPU!');
        }
        
        navigator.gpu?.requestAdapter().then((adapter: GPUAdapter | null) => {
            adapter?.requestDevice().then((device: GPUDevice) => {
                if (!canvas.current) throw "missing canvas";
    
                const format = 'bgra8unorm';
                const context = canvas.current.getContext('webgpu') as unknown as GPUCanvasContext;
                context.configure({
                    device: device, format: format
                });
                
                const vertexBuffer = device.createBuffer({
                    size: 3 * 4,
                    usage: GPUBufferUsage.UNIFORM
                });
        
                const colorBuffer = device.createBuffer({
                    size: 4 * 4,
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
                })
    
                setGpu({device, context, format, vertexBuffer, colorBuffer});
            });
        });
    }, []);

    useEffect(() => {
        if (!gpu) return;
        render(color, gpu);
    });

    const sliderCallback = (val: Float32Array) => {
        setColor(val);
        if (!gpu) return;
        render(color, gpu);
    };
    
    return (
        <Container centerContent>
            <Box width={width + 30} height={height + 30} marginBottom='1em' borderWidth='15px' borderColor='purple.900' borderRadius='1em'>
                <canvas width={width} height={height} ref={canvas} ></canvas>
            </Box>
            <Container background='purple.700' padding='0.5em' borderWidth='0.2em' borderRadius='1em' borderColor='purple.500'>
                <RGBASlider channel={RGBA.R} color={color} setColor={ sliderCallback } />
                <RGBASlider channel={RGBA.G} color={color} setColor={ sliderCallback } />
                <RGBASlider channel={RGBA.B} color={color} setColor={ sliderCallback } />
            </Container>
        </Container>
    )
};

const render = (color: Float32Array, gpu: GPUState) => {
    const shader = Shaders(color);
        if (!gpu) return;
        const pipeline = gpu.device.createRenderPipeline({
            vertex: {
                module: gpu.device.createShaderModule({                    
                    code: shader.vertex
                }),
                entryPoint: "main",
            },
            fragment: {
                module: gpu.device.createShaderModule({                    
                    code: shader.fragment
                }),
                entryPoint: "main",
                targets: [{
                    format: gpu.format as GPUTextureFormat
                }],
            },
            primitive:{
               topology: "triangle-list",
            },
            layout: gpu.device.createPipelineLayout({
                bindGroupLayouts: [
                    gpu.device.createBindGroupLayout({
                        entries: [
                            {
                                binding: 0,
                                // One or more stage flags, or'd together
                                visibility: GPUShaderStage.VERTEX,
                                buffer: { type: 'uniform', minBindingSize: 12 }
                            },

                            {
                                binding: 1,
                                visibility: GPUShaderStage.FRAGMENT,
                                buffer: { type: 'read-only-storage', minBindingSize: 16 }
                            }
                        ]
                    }),
                ]
            })
        });

        const bindGroup = gpu.device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: gpu.vertexBuffer } },
                { binding: 1, resource: { buffer: gpu.colorBuffer } },
            ]
        });

        const commandEncoder = gpu.device.createCommandEncoder();
        const textureView = gpu.context.getCurrentTexture().createView();
        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: textureView,
                loadOp: 'clear',
                clearValue: { r: 0.19607843137, g: 0.14901960784, b: 0.34901960784, a: 1.0 }, //background color
                storeOp: 'store'
            }],
        });
        renderPass.setBindGroup(0, bindGroup);
        renderPass.setPipeline(pipeline);
        renderPass.draw(3);
        renderPass.end();

        gpu.device.queue.writeBuffer(gpu.colorBuffer, 0, color);
        gpu.device.queue.submit([commandEncoder.finish()]);
}

export default Canvas;