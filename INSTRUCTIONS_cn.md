# WebGPU Forward+ 和 Clustered Deferred 着色 - 说明

**截止日期为10月18日星期五晚上11:59。**

在本项目中，你将实现课堂上讨论的Forward+和Clustered Deferred着色方法。你将获得一个包含Sponza中庭模型和大量点光源的场景，以及一个可以切换不同渲染模式的GUI。

## 内容

- `src/` 包含此项目的所有TypeScript和WGSL代码。它包含几个子目录：
  - `renderers/` 定义了不同的渲染器，你将在其中实现Forward+和Clustered Deferred着色
  - `shaders/` 包含在运行时被解释为着色器程序的WGSL文件，以及预处理着色器的`shaders.ts`文件
  - `stage/` 包括相机控制、场景加载和光源，你将在其中实现聚类计算着色器
- `scenes/` 包含测试场景中使用的Sponza中庭模型

## 运行代码

按照以下步骤安装和查看项目：
- 克隆此仓库
- 下载并安装[Node.js](https://nodejs.org/en/)
- 在项目的根目录下运行`npm install`，下载并安装依赖项
- 运行`npm run dev`，这将在浏览器中打开项目
  - 当你编辑任何文件时，项目将自动重新加载

### 注意：

- 克隆并设置后，项目**不会**立即工作，因为你需要完成一些任务才能让它运行起来（参见[项目说明](#part-1-implement-the-different-rendering-methods)）。
- 浏览器和GPU
  - 此项目需要支持WebGPU的浏览器。确保你可以通过[WebGPU测试](https://toji.github.io/webgpu-test/)看到渲染的Sponza场景。
    - Google Chrome在所有平台上似乎效果最佳。
    - 尝试[Google Chrome Canary](https://www.google.com/chrome/canary/)获取最新更新。
  - 如果你在运行初始代码时遇到问题，请使用Chrome并确保你已更新浏览器和视频驱动程序。
  - 如有需要，请按照[项目0](https://github.com/CIS5650-Fall-2024/Project0-Getting-Started/blob/main/INSTRUCTION.md#part-23-project-instructions---webgpu)中的步骤操作。
- 确保https://webgpureport.org/上的`Adapter Info -> Description`是你的主GPU。通常，默认选择的是低功率GPU。要永久切换，请使用操作系统的GPU设置将GPU设为浏览器的默认设置。

### 调试工具

- 你可以使用浏览器开发者工具中的标准控制台调试器来检查和调试代码。
- 此外，你可以使用[Chrome WebGPU Developer Tools扩展](https://chromewebstore.google.com/detail/webgpu-devtools/ckabpgjkjmbkfmichbbgcgbelkbbpopi)捕获帧并检查详细的GPU相关信息。
  - 在Chrome中安装扩展后，通过导航至**开发者工具 -> 更多工具 -> WebGPU**访问WebGPU面板。
  - 请注意，该扩展目前处于不稳定状态。如果重置按钮不能按预期工作，请尝试重新打开标签页以刷新面板。

### GitHub Pages设置（5分）

由于此项目使用WebGPU，所以可以很容易地将其部署在网络上供任何人查看。要设置此功能，请执行以下操作：
- 进入你的仓库设置
- 转到"Pages"选项卡
- 在"Build and Deployment"下，将"Source"设置为"GitHub Actions"

你还需要转到仓库的"Actions"选项卡并在那里启用工作流。

完成这些步骤后，对`main`分支的任何新提交都应该自动部署到URL `<username>.github.io/<repo_name>`。

## 要求

**有任何疑问请在Ed Discussion上提问。**

在这个项目中，你获得了以下代码：
- glTF场景加载
- 相机控制
- 光源移动计算着色器
- 朴素前向渲染器
- Forward+和Clustered Deferred渲染器的骨架代码
- 辅助函数

要编辑项目，你需要使用[Visual Studio Code](https://code.visualstudio.com/)。安装VSCode后，你可以使用"文件 > 打开文件夹..."打开项目的根文件夹开始编码。你可能还会发现[这个扩展](https://marketplace.visualstudio.com/items?itemName=PolyMeilex.wgsl)对于高亮WGSL语法很有用。

WebGPU错误将出现在浏览器的开发者控制台中（Windows上Chrome的Ctrl + Shift + J）。与一些其他图形API不同，WebGPU错误消息通常非常有用，特别是如果你为各种管道组件标记了有意义的名称。当某些内容不能正常工作时，请务必检查控制台。

### 第1部分：实现不同的渲染方法

首先，朴素渲染器缺少一个相机视图投影矩阵缓冲区，你的任务是填补缺失的部分。这将让你接触到代码库的各个部分，并有望帮助你理解WebGPU渲染管线的一般布局。

#### 1) 朴素（20分）

1.1) 创建并写入缓冲区
- 你首先需要在`camera.ts`中创建缓冲区并向其写入视图投影矩阵
- 然后，你需要将缓冲区上传到GPU
- 查找包含`TODO-1.1`的注释了解详情

1.2) 在绑定组和渲染通道中使用缓冲区
- 然后你需要在朴素渲染器的布局和管线中使用该缓冲区
- 查找包含`TODO-1.2`的注释了解详情

1.3) 相应地更新着色器
- 最后，你需要更新朴素渲染器着色器以实际使用新缓冲区
- 查找包含`TODO-1.3`的注释了解详情

然后，根据讲座和答疑中的讨论，你需要实现Forward+和Clustered Deferred渲染方法并分析它们的结果。以下是两种方法的摘要：

#### 2) Forward+（50分）

  - 建立一个数据结构来跟踪每个簇中有多少光源以及它们的索引是什么
  - 只使用与其簇重叠的光源渲染每个片段
  - 查找包含`TODO-2`的注释了解详情

添加新缓冲区时，特别是包含新结构体的缓冲区，它们的对齐方式可能与你预期的不同。请务必使用[这个在线计算器](https://webgpufundamentals.org/webgpu/lessons/resources/wgsl-offset-computer.html#)检查结构体的对齐情况，并与主机上的内存布局匹配。

#### 3) Clustered Deferred（15分）

  - 重用Forward+的聚类逻辑
  - 将顶点属性存储在G-buffer中
  - 在单独的全屏通道中从G-buffer读取以生成最终输出
  - 查找包含`TODO-3`的注释了解详情

### 第2部分：额外加分：效果和优化

要获得全部分数，你必须展示良好的优化努力并记录测试的每个版本的性能。

#### 额外加分：后处理（5分）

实现以下后处理效果之一：
- 使用后处理模糊（盒式或高斯）的泛光
- 卡通着色（带有渐变着色+简单深度边缘检测的轮廓）

要获得全部分数，你必须创建一个新的计算通道（而不是全屏渲染通道）用于后处理。

#### 额外加分：G-buffer优化（10分）

使用单个计算通道替换基础代码中提供的顶点+片段着色器全屏渲染通道。（+5）

优化用于Clustered Deferred渲染器的G-buffer。特别是，旨在减少每像素数据的纹理数量和大小。如果你的G-buffer仅使用一个颜色输出图像，并且每个像素存储的额外数据小于或等于一个`vec4f`，你将获得全部分数。（+5）

以下是一些入门的想法：

- 将值打包到`vec4`中
  - 根据你如何打包数据使用`vec4f`或`vec4u`
- 使用2分量法线
  - 对于更多压缩，请查看八面体法线编码，甚至可以打包成一个`u32`
- 通过将值打包到更小的数据类型中量化值
  - 你可能会发现像[`pack2x16snorm`](https://www.w3.org/TR/WGSL/#pack2x16snorm-builtin)这样的函数很有用
- 减少通过G-buffer传递的属性数量
  - 例如，不要在纹理中存储世界位置，而是使用相机矩阵和深度重建它

#### 额外加分：可见性缓冲（15分）

对于GPU带宽有限的设备，我们可以尝试进一步减少几何通道的内存占用。这可以通过使用单通道`u32`缓冲区进行着色来实现。以下是一些提示：

1. 重写当前G-buffer代码以输出ObjectID和TriangleID；格式可以是(`(ObjectID << offset) + TriangleID`)
1. 在着色阶段，将三角形索引缓冲区和顶点缓冲区绑定为两个存储缓冲区，并根据ObjectID和TriangleID加载顶点属性
1. 使用当前像素的位置和深度重建其世界位置，然后使用当前像素和三个三角形顶点的世界位置计算重心坐标
1. 插值顶点属性
1. 根据ObjectID执行着色（在这里采样纹理时不需要进行mipmap处理即可获得全部分数）

请注意，如果你想在G-buffer优化的基础上实现这一功能，为了同时获得两者的全部分数，你需要一些在两个管线间切换的方法。

更多参考资料，请参阅以下材料：

- [The Visibility Buffer: A Cache-Friendly Approach to Deferred Shading (JCGT)](https://jcgt.org/published/0002/02/04/)
- [Visibility Buffer Rendering with Material Graphs – Filmic Worlds](http://filmicworlds.com/blog/visibility-buffer-rendering-with-material-graphs/)

#### 额外加分：渲染包（5分）

使用[渲染包](https://toji.dev/webgpu-best-practices/render-bundles.html)减少主机端绘制调用的开销。确保你提供显示此更改效果的性能分析。

## 性能分析（10分）

比较你实现的Forward+和Clustered Deferred着色并分析它们的差异。
- 其中一个更快吗？
- 其中一个在某些类型的工作负载上更好吗？
- 使用一个而非另一个的好处和权衡是什么？
- 对于性能上的任何差异，简要解释可能导致差异的原因。

优化你的TypeScript和/或WGSL代码。Chrome的分析工具对此有用。对于每一个提高性能的更改，显示更改前后的渲染时间。

如果你的Forward+或Clustered Deferred渲染器运行速度比预期慢得多，请确保你不是在着色器代码中复制大型结构体/数组。你可以在WGSL中使用[指针](https://google.github.io/tour-of-wgsl/types/pointers/using/)来避免这个问题。

对于每个新的效果功能（必需的或额外的），请提供以下分析：
  - 功能的简洁概述和解释。
  - 添加该功能导致的性能变化。
  - 如果适用，参数（如光源数量、瓦片数量等）如何影响性能？用图表展示数据。
    - 以毫秒为单位显示时间，而不是FPS。
  - 如果你做了什么来加速该功能，你做了什么以及为什么？
  - 除了你当前的实现外，这个功能如何可能被优化？

对于每个性能功能（必需的或额外的），请提供：
  - 功能的简洁概述和解释。
  - 添加该功能的详细性能改进分析。
    - 你的性能改进的最佳情况是什么？最差情况是什么？简要解释。
    - 这个性能功能有权衡吗？简要解释。
    - 参数（如光源数量、瓦片数量等）如何影响性能？用图表展示数据。
      - 以毫秒为单位显示时间，而不是FPS。
    - 尽可能显示调试视图。
      - 如果调试视图与性能相关，解释其关系。

## 基础代码概述

一般来说，你可以搜索包含"CHECKITOUT"的注释，以查看基础代码中最重要/最有用的部分。

- `src/main.ts` 初始化WebGPU、各种共享实体（光源、相机、场景等）以及渲染器本身。除非你想编辑GUI，否则你可能不需要更改此文件。
- `src/stage/` 包含处理舞台信息的所有类。
  - `src/stage/camera.ts` 包含相机控制。你需要在此为Forward+和Deferred Clustered渲染器添加新的统一缓冲区，用于某些相机矩阵。
  - `src/stage/lights.ts` 控制光源的位置和颜色。这是你调用光源聚类计算着色器的地方。
  - `src/stage/scene.ts` 加载glTF场景文件。除非你想加载除提供的Sponza场景之外的场景，否则你不需要编辑此文件。
  - `src/stage/stage.ts` 将上述三个实体组合为一个类，以便于使用。
- `src/renderer.ts` 是所有渲染器扩展的基础`Renderer`类。你需要编写的大部分逻辑将进入子类，所以你不需要编辑此文件。
- `src/renderers/` 包含`Renderer`的子类。文件名是自解释的。这是大多数新主机端逻辑将被编写的地方。
- `src/shaders/` 包含所有WGSL着色器。
  - `src/shaders/shaders.ts` 加载并预处理WGSL着色器文件。你可以在这里添加可以在着色器中直接引用的常量，类似于C++中的预处理器定义。
  - `src/shaders/common.wgsl` 包含预加到所有着色器前的一些着色器实用函数。如果可能，多个着色器使用的代码应该放在这里。
- `src/math_utils.ts` 包含一些数学辅助函数。随时添加更多。

## README

将`README.md`的内容替换为以下内容：
- 对你的项目和你实现的具体功能的简要描述
- 至少一张你的项目运行的屏幕截图
- 一个30+秒的视频/gif，展示你的项目运行并显示所有功能（即使你的演示可以在线查看，它可能无法在所有计算机上运行，而视频将在任何地方都能工作）
- 指向你项目的网站链接（参见[GitHub Pages设置](#github-pages-setup)）
- 性能分析（参见[上文](#performance-analysis)）

## 提交

打开GitHub拉取请求，以便我们可以看到你已完成。标题应为"Project 4: YOUR NAME"。拉取请求评论部分的模板如下所示，你可以进行一些复制和粘贴：

- 仓库链接
- 简要提及你已完成的功能，特别是那些你想要强调的额外功能：
  - 功能0
  - 功能1
  - ...
- 对项目本身的反馈，如果有的话。

### 第三方代码政策

- 使用任何第三方代码必须通过在Ed Discussion上询问获得批准。
- 如果获得批准，所有学生都可以使用它。通常，我们批准使用不是项目核心部分的第三方代码。例如，对于路径追踪器，我们会批准使用第三方库加载模型，但不会批准复制和粘贴用于折射的CUDA函数。
- 第三方代码**必须**在README.md中注明出处。
- 未经批准使用第三方代码，包括使用其他学生的代码，是违反学术诚信的行为，至少会导致你在本学期获得F成绩。 