import {
    _decorator,
    Color,
    Component,
    Graphics,
    Node,
    UITransform,
    Vec2,
    EventTouch,
    sp,
    PhysicsGroup,
    game,
    __private,
    Sprite,
    Event,
} from "cc";
import { EDITOR, PREVIEW } from "cc/env";
import { EVENT } from "db://assets/Enum";
const { ccclass, property } = _decorator;
import { VertSprite } from "db://assets/VertSprite/VertSprite";

class vParticle {
    pos: Vec2 = new Vec2();
    row: number;
    col: number;
    static mass = 1;
    static maxSpeed: number = 1600;
    static damping: number = 0.5;
    _velocity: Vec2 = new Vec2(0, 0);
    _force: Vec2 = new Vec2(0, 0);
    isStable: boolean = false;
    get velocity(): Vec2 {
        return this._velocity;
    }
    constructor(pos: Vec2, row: number, col: number) {
        this.pos = pos;
        this.row = row;
        this.col = col;
    }
    // 添加一个单独的方法来限制速度
    limitVelocity() {
        const speed = this._velocity.length();
        if (speed > vParticle.maxSpeed) {
            this._velocity.normalize().multiplyScalar(vParticle.maxSpeed);
        }
    }
    resetForce() {
        this._force.set(0, 0);
    }
    resetVelocity() {
        this._velocity.set(0, 0);
    }

    addForce(otherF: Vec2) {
        Vec2.add(this._force, this._force, otherF);
    }

    updateVelocity(dt: number) {
        if (this.isStable) {
            this.resetVelocity();
            return;
        }

        this._velocity.x += (this._force.x / vParticle.mass) * dt;
        this._velocity.y += (this._force.y / vParticle.mass) * dt;
        this.limitVelocity();
        this.resetForce();
    }

    updatePos(dt: number) {
        this.updateVelocity(dt);
        this.pos.x += this._velocity.x * dt;
        this.pos.y += this._velocity.y * dt;
        this.velocity.multiplyScalar(vParticle.damping);
    }

    setPos(newPos: Vec2) {
        this.resetVelocity();
        this.resetForce();
        this.pos.set(newPos);
    }
    freeze() {
        this.isStable = true;
    }
    unfreeze() {
        this.isStable = false;
    }
}

class vPGroup {
    particles: vParticle[] = [];
    springs: ParticleSpring[] = [];
    targetPos: Vec2 = new Vec2(1024, 1200);
    targetRadius: number = 200;
    cRow: number = 1;
    cCol: number = 1;

    addParticles(particle: vParticle) {
        this.particles.push(particle);
    }
    addSpring(start: vParticle, end: vParticle, springConstant: number) {
        const restLength = Vec2.distance(start.pos, end.pos);
        const spring1 = new ParticleSpring(
            start,
            end,
            restLength,
            springConstant,
        );
        const spring2 = new ParticleSpring(
            end,
            start,
            restLength,
            springConstant,
        );
        this.springs.push(spring1);
        this.springs.push(spring2);
    }

    _tempV: Vec2 = new Vec2();
    dragAt(pos: Vec2, dir: Vec2) {
        if (this.isArrive) return;

        this.particles.forEach((p) => {
            const dis = Vec2.distance(p.pos, pos);
            const force = 24000000 / Math.max(dis, 0.01);
            Vec2.multiplyScalar(this._tempV, dir, force);

            p.addForce(this._tempV);
        });
    }

    // 吸附，对全体粒子施加*相同*的平移力(避免形状坍缩)
    attract() {
        if (this.particles.length === 0) return;

        // 选择一个参考粒子（这里选择数组中间的粒子，近似为中心）
        const refIndex = Math.floor(this.particles.length / 2);
        const refParticle = this.particles[refIndex];

        // 如果参考粒子已经冻结（稳定），则不需要再施加吸引力
        if (refParticle.isStable) return;

        // 计算参考粒子应该受到的吸引力 (方向：指向 targetPos)
        Vec2.subtract(this._tempV, this.targetPos, refParticle.pos);
        const distance = this._tempV.length();

        // 如果距离很近，无需施加力
        if (distance < 10) return;

        // 归一化方向
        this._tempV.normalize();

        // 为了简单且有效，我们施加一个恒定的导向力，具体加速度由 updateVelocity 处理
        const strength = 8000000;

        Vec2.multiplyScalar(this._tempV, this._tempV, strength);

        // 将这个相同的力施加给全体粒子
        this.particles.forEach((p) => {
            if (!p.isStable) {
                p.addForce(this._tempV);
            }
        });
    }

    moveByForce(dt: number) {
        this.springs.forEach((spring) => {
            spring.start.addForce(spring.getSpringForce());
        });
        this.particles.forEach((p) => {
            p.updatePos(dt);
            if (Vec2.distance(p.pos, this.targetPos) < this.targetRadius) {
                p.freeze();
            }
        });
    }

    isConnecting: boolean = false;
    isArrive: boolean = false;
    checkState(callback?: () => void): boolean {
        if (this.isArrive) return;
        let freezeCount = 0;
        this.particles.forEach((p, index) => {
            if (index % this.cCol < this.cRow - 3) return;
            if (p.isStable == true) freezeCount++;
        });

        // 当有粒子处于冻结状态时，进入连接状态
        if (freezeCount > 0) this.isConnecting = true;
        if (freezeCount > 10) this.isArrive = true;

        // 当处于连接状态时，调用吸引方法，使整体向目标移动
        if (this.isConnecting) {
            this.attract();
        }
        // 当到达目标时，调用解冻方法，使根部脱离,并且休眠
        if (this.isArrive) {
            this.unfreezeRow(0);
            callback?.();
        }

        return this.isConnecting;
    }

    freezeRow(rowIndex: number) {
        this.particles.forEach((p, index: number) => {
            if (index % this.cCol == rowIndex) p.freeze();
        });
    }

    unfreezeRow(rowIndex: number) {
        this.particles.forEach((p, index: number) => {
            if (index % this.cCol == rowIndex) p.unfreeze();
        });
    }
}

/**
 * 粒子弹簧
 * 注意:只表现为单方向的力,没有对应的反作用力
 */
class ParticleSpring {
    start: vParticle = null;
    end: vParticle = null;
    restLength: number = 0;
    springConstant: number = 512;
    _force: Vec2 = new Vec2(0, 0);
    _deltaP: Vec2 = new Vec2(0, 0);

    constructor(
        me: vParticle,
        other: vParticle,
        length: number,
        springConstant: number,
    ) {
        this.start = me;
        this.end = other;
        this.restLength = length;
        this.springConstant = springConstant;
    }

    getSpringForce(): Vec2 {
        this._force.set(0, 0);
        Vec2.subtract(this._deltaP, this.end.pos, this.start.pos);
        const dis = this._deltaP.length();
        const deltaL = dis - this.restLength;
        const strength = deltaL * this.springConstant;
        this._deltaP.normalize();
        Vec2.multiplyScalar(this._force, this._deltaP, strength);

        return this._force;
    }
}

export class PetalEvent extends Event {
    constructor(name: string, petalnode: Node) {
        super(name, true);
        this.petal = petalnode;
        console.log(`petalEvent ${name}, petal`, petalnode.uuid);
    }
    petal: Node = null;
}

@ccclass("Particles")
export class Particles extends Component {
    _verts: { x: number; y: number }[] = [];
    _particleGroup: vPGroup = new vPGroup();

    @property(UITransform)
    targetUIT: UITransform = null!;

    @property(VertSprite)
    vertSp: VertSprite = null!;

    @property(Graphics)
    g: Graphics = null!;

    _targetNode: Node = null;
    @property(Node)
    get targetNode(): Node {
        return this._targetNode;
    }

    set targetNode(n: Node) {
        this._targetNode = n;
        const pos = this.targetUIT.convertToNodeSpaceAR(
            this.targetNode.worldPosition,
        );
        const pos2 = new Vec2(pos.x, pos.y);
        this._particleGroup.targetPos = pos2;
    }

    protected onLoad(): void {}

    _isSleep: boolean = false;
    protected onEnable(): void {
        this.node.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
    }

    protected onDisable(): void {
        this.node.off(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
    }

    sleep() {
        if (this._isSleep) return;
        this.scheduleOnce(() => {
            this._isSleep = true;
            this.node.dispatchEvent(
                new PetalEvent(EVENT.PETAL_SLEEP, this.node),
            );
        }, 2);
    }

    wake() {
        this._isSleep = false;
    }

    _touchDelta: Vec2 = new Vec2();
    _touchPos: Vec2 = new Vec2();
    onTouchMove(event: EventTouch) {
        event.getDelta(this._touchDelta);
        event.getLocation(this._touchPos);

        this.wake();

        // 修正：手动计算世界旋转角度（累加自身及所有父节点的旋转）
        let worldAngle = 0;
        let current: Node | null = this.node;
        while (current) {
            worldAngle += current.angle;
            current = current.parent;
        }

        const rad = -(worldAngle * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        // 备份原始增量
        const originalX = this._touchDelta.x;
        const originalY = this._touchDelta.y;

        // 应用旋转：x' = x*cos - y*sin, y' = x*sin + y*cos
        this._touchDelta.x = originalX * cos - originalY * sin;
        this._touchDelta.y = originalX * sin + originalY * cos;

        this._particleGroup.dragAt(
            this._touchPos,
            this._touchDelta.normalize(),
        );
    }

    start() {
        this._verts = this.vertSp?.vertices;
        const cRow = this.vertSp?.vertRows;
        const cCol = this.vertSp?.vertCols;
        this.creatParticleGroup(
            this._verts,
            cRow,
            cCol,
            8,
            this._particleGroup,
        );
        console.log(this._verts);

        this.scheduleOnce(() => this.vertSp?.markForUpdateRenderData());
    }

    update(deltaTime: number) {
        if (this._isSleep) return;
        if (PREVIEW || EDITOR) this.draw();
        this.vertSp?.markForUpdateRenderData();
    }

    //debug
    private draw() {
        this.g.clear();
        // this.drawVerts();
        this.drawSpring();
        // this.drawParticles();
        this.drawTarget();
    }

    private updateVerticles() {
        if (
            this.vertSp == null ||
            this.vertSp == undefined ||
            !this.vertSp.isValid
        )
            return;
        this._particleGroup.particles.forEach((p) => {
            const index = p.row * this.vertSp?.vertCols + p.col;
            this.vertSp.vertices[index] = { x: p.pos.x, y: p.pos.y };
        });
    }

    protected lateUpdate(dt: number): void {
        if (this._isSleep) return;
        this._particleGroup.moveByForce(dt);
        const CONNECTING = this._particleGroup.checkState(
            this.sleep.bind(this),
        );
        if (CONNECTING) {
            this.node.dispatchEvent(
                new PetalEvent(EVENT.CONNECTING, this.node),
            );
        }
        this.updateVerticles();
    }

    private drawParticles() {
        this.g.fillColor = Color.RED;
        this._particleGroup.particles.forEach((particle) => {
            this.g.circle(particle.pos.x, particle.pos.y, 5);
        });
        this.g.fill();
    }

    private drawVerts() {
        this.g.fillColor = Color.BLUE;
        this._verts.forEach((vert) => {
            const { x, y } = vert;
            this.g.circle(x, y, 4);
        });
        this.g.fill();
    }
    private drawTarget() {
        this.g.fillColor = Color.YELLOW;
        const { x, y } = this._particleGroup.targetPos;
        const r = this._particleGroup.targetRadius;
        this.g.circle(x, y, r);
        this.g.fill();
    }

    private drawSpring() {
        this.g.lineWidth = 8;
        this._particleGroup.springs.forEach((spring) => {
            const b = spring.springConstant / 2000;
            this.g.strokeColor = new Color(b, b, b);
            this.g.moveTo(spring.start.pos.x, spring.start.pos.y);
            this.g.lineTo(spring.end.pos.x, spring.end.pos.y);
        });
        this.g.stroke();
    }

    creatParticleGroup(
        verts: { x: number; y: number }[],
        cRow: number,
        cCol: number,
        r: number,
        group: vPGroup,
    ) {
        const contentSize = this.targetUIT.contentSize;
        const dx = contentSize.x / cRow;
        const dy = contentSize.y / cCol;
        this._particleGroup.cRow = cRow;
        this._particleGroup.cCol = cCol;
        for (let col = 0; col < cCol; col++) {
            for (let row = 0; row < cRow; row++) {
                const x = col * dx;
                const y = row * dy;
                //渲染顶点
                verts.push({ x: x, y: y });
                //物理粒子
                const newP = new vParticle(new Vec2(x, y), row, col);
                this._particleGroup.addParticles(newP);
                //纵向结构弹簧
                if (this._particleGroup.particles.length > 1 && row != 0) {
                    const last = this._particleGroup.particles.at(-1);
                    const lastlast = this._particleGroup.particles.at(-2);
                    this._particleGroup.addSpring(last, lastlast, 512);

                    //纵向防翻转弹簧
                    if (
                        this._particleGroup.particles.length > 2 &&
                        row <= cRow - 1 &&
                        (col == 0 || col == cCol - 1)
                    ) {
                        const lastlastlast =
                            this._particleGroup.particles.at(-3);
                        this._particleGroup.addSpring(last, lastlastlast, 800);
                    }
                }
                if (col > 0) {
                    //横向结构弹簧
                    const last = this._particleGroup.particles.at(-1);
                    const upper =
                        this._particleGroup.particles[(col - 1) * cRow + row];
                    this._particleGroup.addSpring(last, upper, 512);
                    //斜向剪切弹簧
                    if (row > 0) {
                        const stripU =
                            this._particleGroup.particles[
                                (col - 1) * cRow + row - 1
                            ];
                        this._particleGroup.addSpring(last, stripU, 512);
                    }
                    if (row < cRow - 1) {
                        const stripD =
                            this._particleGroup.particles[
                                (col - 1) * cRow + row + 1
                            ];
                        this._particleGroup.addSpring(last, stripD, 512);
                    }
                    //横向防翻转弹簧
                    if (col > 1 && (row == 0 || row == cRow - 1)) {
                        const upperupper =
                            this._particleGroup.particles[
                                (col - 2) * cRow + row
                            ];
                        this._particleGroup.addSpring(last, upperupper, 800);
                    }
                }
            }
        }
        //两极静止领域
        this._particleGroup.freezeRow(0);
    }
}
