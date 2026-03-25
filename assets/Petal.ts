import { _decorator, Component, Node } from "cc";
import { PETAL_TYPE } from "db://assets/Enum";
const { ccclass, property } = _decorator;

@ccclass("Petal")
export class Petal extends Component {
    petal_type: PETAL_TYPE = PETAL_TYPE.BLUE;
    protected onEnable(): void {
        this.node.resumeSystemEvents(true);
    }

    protected onDisable(): void {
        this.node.pauseSystemEvents(true);
    }
}
