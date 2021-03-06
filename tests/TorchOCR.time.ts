import TorchOCR from '@/backends/TorchOCR'
import { performance } from 'perf_hooks'
import { Tensor } from 'torch-js'

void (async () => {
    try {
        let tStart = performance.now()
        const torchOCR = new TorchOCR()
        torchOCR.initRCNN()
        await torchOCR.initOCR()
        await torchOCR.initVideoPlayer('D:/Projects/freyja-sub-ocr-electron/tests/files/sample.mp4')
        console.log(`Init torchOCR: ${(performance.now() - tStart)}ms`)

        const step = 20
        let tensorDataPromise = new Promise(resolve => resolve())
        let rcnnPromise = new Promise(resolve => resolve())
        let ocrPromise = new Promise(resolve => resolve())
        const ocrPromiseBuffer = [ocrPromise, ocrPromise, ocrPromise, ocrPromise]
        const tLoop = performance.now()
        for (let frame = 0; frame < 800; frame += step) {
            tensorDataPromise = Promise.all([tensorDataPromise, ocrPromiseBuffer[0]]).then(async () => {
                tStart = performance.now()
                const rawImg: Array<Buffer> = []
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                for (const i of Array(step).keys()) {
                    const frame = await torchOCR.readRawFrame(undefined)
                    if (frame === null) {
                        continue
                    }
                    rawImg.push(frame)
                }
                const inputTensor = torchOCR.bufferToImgTensor(rawImg, 600)
                console.log(`Copy Tensor data (img) ${frame}: ${(performance.now() - tStart)}ms`)
                return inputTensor
            })

            rcnnPromise = Promise.all([rcnnPromise, tensorDataPromise]).then(async (values) => {
                tStart = performance.now()
                const inputTensor = values[1] as Tensor
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const rcnnResults = await torchOCR.rcnnForward(inputTensor)
                console.log(`Inferance RCNN ${frame}: ${(performance.now() - tStart)}ms`)
                return rcnnResults
            })

            ocrPromise = Promise.all([ocrPromise, tensorDataPromise, rcnnPromise]).then(async (values) => {
                tStart = performance.now()
                const inputTensor = values[1] as Tensor
                const rcnnResults = values[2] as Array<Record<string, Tensor>>
                const subtitleInfos = torchOCR.rcnnParse(rcnnResults)
                const boxesTensor = torchOCR.subtitleInfoToTensor(subtitleInfos)
                console.log(`Copy Tensor data (box) ${frame}: ${(performance.now() - tStart)}ms`)

                tStart = performance.now()
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const ocrResults = torchOCR.ocrParse(await torchOCR.ocrForward(inputTensor, boxesTensor))
                console.log(`Inferance OCR ${frame}: ${(performance.now() - tStart)}ms`)
                inputTensor.free()
                boxesTensor.free()
            })
            void ocrPromiseBuffer.shift()
            ocrPromiseBuffer.push(ocrPromise)
        }
        await Promise.all([tensorDataPromise, rcnnPromise, ocrPromise])
        console.log(`\nTotal loop: ${(performance.now() - tLoop)}ms`)
    } catch (e) {
        console.log(e)
    }
})()
