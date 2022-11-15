/* eslint-disable eqeqeq */
function createElement(type, props, ...children) {
    // 核心逻辑不复杂，将参数都塞到一个对象上返回就行
    // children 也要放到props里面去，这样我们在组件里面就能通过this.props.children拿到子元素
    return {
        type,
        props:{
            ...props,
            children: children.map(child => {
                return typeof child === 'object' ? child : createTextDom(child)
            })
        }
    }
}

function createTextDom(text) {
    return {
        type: 'TEXT',
        props:{
            nodaValue: text,
            children: []
        }
    }
}

/**
 * 
 * @param {*} vDom 虚拟dom
 * @param {*} container 应用容器
 */
function render(vDom, container) {
    workInProgressRoot = {
        dom: container,
        props: {
            children: [vDom]
        },
        alternate: currentRoot
    }

    deletions = []
    nextUnitOfWork = workInProgressRoot;
}

/**
 * fiber架构
 * requestIdleCallback。浏览器自带api可以帮助我们在浏览器空闲的时候自动调用执行(这个实研api，兼容不是很好)
 */
function workLoop(deadline) {
    // 下一个的任务是存在的，并且任务的执行时间期限还没结束
    while (nextUnitOfWork && deadline.timeRemaining() > 1) {
        nextUnitOfWork = performUnitOfWork(nextUnitOfWork)
    }

    // 任务做完之后统一渲染
    if (!nextUnitOfWork && workInProgressFiber) {
        commitRoot()
    }
    // 任务还没有完成，但是时间到了，我们就需要注册下一个空闲时间运行任务
    requestIdleCallback(workLoop)
}


// 启动任务
requestIdleCallback(workLoop)

// 统一操作dom
function commitRoot() {
    commitRootImpl(workInProgressRoot.child);
    workInProgressRoot = null;
}

function commitRootImpl(fiber){
    if(!fiber){
        return
    }

    const parentDom = fiber.return.dom;
    if (fiber.effectTag == "REPLACEMENT" && fiber.dom) {
        parentDom.appendChild(fiber.dom);
    } else if(fiber.effectTag =="DELETION") {
        parentDom.removeChild(fiber.dom);
    } else if (fiber.effectTag == "UPDATE") {
        updateDom(fiber.dom, fiber.alternate.props, fiber.props)
    }

    // 递归操作子元素的兄弟元素
    commitRootImpl(fiber.child);
    commitRootImpl(fiber.slibing);
}

function createDom(vDom) {
    let dom;
    // 检查当前节点是文本还是对象
    if (vDom.type == 'TEXT') {
        dom = document.createTextNode(vDom.props.nodaValue)
    } else {
        dom = document.createElement(vDom.type)
        // 将vDom 的除了children外层属性都挂载到dom对象上
        if (vDom.props) {
            Object.keys(vDom.props)
            // 过滤children
            .filter(key => key !== 'children')
            .forEach(name => {
                if (name.indexOf('on') === 0) {
                    dom.addEventListener(name.substr(2).toLowerCase(), nextProps[name], false)
                } else {
                    dom[name] = nextProps[name];
                }
            })
        }
    }

    return dom
}

// reconcile 调和
// 比对新老vdom，新老节点类型一致，复用老节点dom，更新props即可
// 如果类型不一样，而且新节点存在，创建新的节点替换老节点
// 如果类型不一样，没有新节点，有老节点，那么删除老节点
function updateDom (dom, preProps, nextProps){
    Object.keys(preProps)
    .filter(name => (name !== 'children'))
    .filter(name => !(name in nextProps))
    .forEach(name => {
        if (name.indexOf('on') === 0) {
            dom.removeEventListener(name.substr(2).toLowerCase(), preProps[name], false)
        } else {
            dom[name] = '';
        }
    })

    Object.keys(nextProps)
    .filter(name => (name !== 'children'))
    .forEach(name => {
        if (name.indexOf('on') === 0) {
            dom.addEventListener(name.substr(2).toLowerCase(), nextProps[name], false)
        } else {
            dom[name] = nextProps[name];
        }
    })
}

// 中间两个全局变量，用来处理useState
// wipFiber是当前的函数组件fiber节点
// hookIndex 是当前函数组件内部useState状态计数
let wipFiber = null;
let hookIndex = null;
function useState(init) {
    // 取出上次的hook
    const oldHook = wipFiber.alternate && wipFiber.alternate.hooks && wipFiber.alternate.hooks[hookIndex];

    // hook数据结构
    const hook = {
        state: oldHook ? oldHook.state : init // state是每个具体的值
    }

    // 将所有的useState调用按照顺序存到fiber节点上
    wipFiber.hooks.push(hook);
    hookIndex++;

    // 修改state方法
    const setState = value => {
        hook.state = value;

        // 只要修改了state，我们就需要处理这个节点
        workInProgressRoot = {
            dom: currentRoot.dom,
            props: currentRoot.props,
            alternate: currentRoot
        }

        // 修改nextUnitOfWork指向workInProgressRoot，这样下次requestIdleCallback就会处理这个节点
        nextUnitOfWork = workInProgressRoot;
        deletions = [];
    }
    return [hook.state, setState]
}

function updateFunctionComponent(fiber){
    // 支持useState，初始化变量
    wipFiber = fiber;
    hookIndex = 0;
    // hooks 用来存储具体的state序列
    wipFiber.hooks = [];

    // 函数组件的type或是个函数，直接拿来执行可以获得dom元素
    const children = [fiber.type(fiber.props)];
    reconcileChildren(fiber, children)
}

// 就是之前的操作，只是单独抽取了一个方法
function updateHostComponent(fiber){
    if (!fiber.dom) {
        // 创建一个dom挂载上去
        fiber.dom = createDom(fiber)
    }
    // 将我们前面的vDom结构转换为fiber结构
    const elements = fiber.props && fiber.props.children;

    // 调和了元素
    reconcileChildren(fiber, elements)
}
// 运行任务的函数，参数是当前的fiber任务，返回值是下一个任务
function performUnitOfWork(fiber){
    // 检测函数组件
    const isFunctionComponent = fiber.type instanceof Function
    if (isFunctionComponent) {
        updateFunctionComponent(fiber)
    } else {
        updateHostComponent(fiber)
    }

    // 这个函数的返回值是下一个任务，其实是一个深度优先遍历
    // 先找子元素，没有子元素了就找兄弟元素
    // 兄弟元素也没有了就返回父元素
    // 然后再找这个父元素的兄弟元素
    // 最后到根节点结束
    // 这个遍历的顺序其实就是从上到下，从左到右
    if (fiber.child) {
        return fiber.child
    }
    let nextFiber = fiber
    while (nextFiber) {
        if (nextFiber.slibing) {
            return nextFiber.slibing
        }
        nextFiber = nextFiber.return
    }

}

class Component {
    constructor(props){
        this.props = props;
    }
}

function transfer(Component) {
    return function (props) {
        const component = new Component(props);
        let [state, setState] = useState(component.state)
        component.props = props;
        component.state = state;
        component.setState = setState;
        return component.render();
    }
}

// eslint-disable-next-line import/no-anonymous-default-export
export default {
    createElement,
    render,
    useState,
    Component,
    transfer
}