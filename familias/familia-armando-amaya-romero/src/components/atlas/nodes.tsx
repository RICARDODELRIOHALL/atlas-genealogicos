import { memo } from "react";
import type { CSSProperties } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import type { Person } from "@/lib/genealogy/types";

export type PersonNodeData = { p: Person; gen: number; isRef: boolean; branch: string; color?: string };
export const BRANCH_LABEL_W = 3200;
export const BRANCH_LABEL_H = 700;
export const GEN_LABEL_H = 140;
const life = (p: Person) => (p.birth || p.death ? `${p.birth || "¿?"} – ${p.death || "¿?"}` : "Sin fechas registradas");

export const PersonNode = memo(function PersonNode({ data }: NodeProps<Node<PersonNodeData>>) {
  const { p, isRef, branch, gen } = data;
  return (
    <div className={`pcard${isRef ? " ref" : ""}`} data-branch={branch} style={{ ...(data.color ? { "--b": data.color } : {}), width: "100%", height: "100%" } as CSSProperties} title={isRef ? "Otra aparición del mismo registro" : p.name}>
      <Handle type="target" position={Position.Left} isConnectable={false} style={{ opacity: 0 }} />
      <div className="nm">{p.name || "Sin nombre registrado"}</div>
      <div className="dt">{life(p)}</div>
      <div className="id flex items-center gap-2">
        <span>{p.fsId}</span><span className="opacity-60">G{gen}</span>
        {isRef && <span className="flag">↪ repetido</span>}
      </div>
      <Handle type="source" position={Position.Right} isConnectable={false} style={{ opacity: 0 }} />
    </div>
  );
});

export const UnionNode = memo(function UnionNode() {
  return (
    <div className="union-dot">
      <Handle type="target" position={Position.Left} isConnectable={false} style={{ opacity: 0, left: 0 }} />
      <Handle type="source" position={Position.Right} isConnectable={false} style={{ opacity: 0, right: 0 }} />
    </div>
  );
});

export const GenLabelNode = memo(function GenLabelNode({ data }: NodeProps<Node<{ gen: number; count: number }>>) {
  return (
    <div className="glabel">
      <div className="small">G{data.gen} · {data.count}</div>
      <div className="big">G{data.gen}</div>
    </div>
  );
});

export const BranchLabelNode = memo(function BranchLabelNode({ data }: NodeProps<Node<{ label: string; color: string }>>) {
  return <div className="blabel" style={{ color: data.color }}><span>{data.label}</span></div>;
});

export const nodeTypes = { person: PersonNode, union: UnionNode, glabel: GenLabelNode, blabel: BranchLabelNode };
