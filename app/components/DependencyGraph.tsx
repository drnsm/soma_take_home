"use client"
import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

interface Todo {
  id: number;
  title: string;
  dependencies?: Todo[];
  dueDate?: Date | null;
  createdAt?: Date;
}

interface DependencyGraphProps {
  todos: Todo[];
  criticalPath: number[];
  focusedTaskId?: number;
  onClose: () => void;
}

interface GraphNode extends d3.SimulationNodeDatum {
  id: number;
  title: string;
  isCritical: boolean;
  isFocused: boolean;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: GraphNode;
  target: GraphNode;
  isCritical: boolean;
}

export const DependencyGraph: React.FC<DependencyGraphProps> = ({ 
  todos, 
  criticalPath, 
  focusedTaskId,
  onClose 
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 1200, height: 800 });

  useEffect(() => {
    if (!svgRef.current || todos.length === 0) return;

    d3.select(svgRef.current).selectAll("*").remove();

    const nodes: GraphNode[] = todos.map(todo => ({
      id: todo.id,
      title: todo.title,
      isCritical: criticalPath.includes(todo.id),
      isFocused: todo.id === focusedTaskId,
    }));

    const links: GraphLink[] = [];
    todos.forEach(todo => {
      (todo.dependencies || []).forEach(dep => {
        const sourceNode = nodes.find(n => n.id === dep.id);
        const targetNode = nodes.find(n => n.id === todo.id);
        if (sourceNode && targetNode) {
          links.push({
            source: sourceNode,
            target: targetNode,
            isCritical: criticalPath.includes(dep.id) && criticalPath.includes(todo.id) &&
                       Math.abs(criticalPath.indexOf(dep.id) - criticalPath.indexOf(todo.id)) === 1,
          });
        }
      });
    });

    const { width, height } = dimensions;
    const svg = d3.select(svgRef.current).attr("viewBox", `0 0 ${width} ${height}`);

    const nodeRadius = (d: GraphNode) => d.isFocused ? 22 : (d.isCritical ? 18 : 14);

    const simulation = d3.forceSimulation<GraphNode>(nodes)
      .force("link", d3.forceLink<GraphNode, GraphLink>(links).id(d => d.id).distance(70).strength(1))
      .force("charge", d3.forceManyBody().strength(-250))
      .force("center", d3.forceCenter(width / 2, height / 2).strength(0.4))
      .force("collision", d3.forceCollide().radius(d => nodeRadius(d as GraphNode) + 15));

    const defs = svg.append("defs");
    defs.selectAll("marker")
      .data(["regular", "critical"])
      .enter().append("marker")
      .attr("id", d => `arrow-${d}`)
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 7)
      .attr("refY", 0)
      .attr("markerWidth", 5)
      .attr("markerHeight", 5)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", d => d === "critical" ? "#8b5cf6" : "#9ca3af");

    const link = svg.append("g")
      .selectAll("path")
      .data(links)
      .enter().append("path")
      .attr("stroke", d => d.isCritical ? "#8b5cf6" : "#9ca3af")
      .attr("stroke-width", d => d.isCritical ? 2 : 1.5)
      .attr("marker-end", d => `url(#arrow-${d.isCritical ? "critical" : "regular"})`)
      .attr("fill", "none");

    const node = svg.append("g")
      .selectAll("g")
      .data(nodes)
      .enter().append("g")
      .call(d3.drag<SVGGElement, GraphNode>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));

    node.append("circle")
      .attr("r", nodeRadius)
      .attr("fill", d => {
        if (d.isFocused) return "#f59e0b";
        return d.isCritical ? "#8b5cf6" : "#3b82f6";
      })
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 2);

    node.append("text")
      .text(d => d.title.length > 15 ? d.title.substring(0, 15) + "..." : d.title)
      .attr("font-size", "11px")
      .attr("text-anchor", "middle")
      .attr("dy", d => nodeRadius(d) + 14)
      .attr("fill", "#1f2937")
      .style("pointer-events", "none");

    node.filter(d => d.isCritical)
      .append("text")
      .text("📊")
      .attr("font-size", d => nodeRadius(d) * 0.9)
      .attr("text-anchor", "middle")
      .attr("alignment-baseline", "central")
      .style("pointer-events", "none");

    simulation.on("tick", () => {
      node.each(d => {
        const r = nodeRadius(d);
        d.x = Math.max(r, Math.min(width - r, d.x!));
        d.y = Math.max(r, Math.min(height - r, d.y!));
      }).attr("transform", d => `translate(${d.x},${d.y})`);


      link.attr("d", d => {
        const source = d.source as GraphNode;
        const target = d.target as GraphNode;
        const dx = target.x! - source.x!;
        const dy = target.y! - source.y!;
        const dist = Math.sqrt(dx * dx + dy * dy);

        const targetPadding = nodeRadius(target) + (target.isFocused ? 4 : 2);

        const tx = target.x! - (dx / dist) * targetPadding;
        const ty = target.y! - (dy / dist) * targetPadding;
        return `M${source.x},${source.y}L${tx},${ty}`;
      });
    });

    function dragstarted(event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>) {
      const r = nodeRadius(event.subject);
      event.subject.fx = Math.max(r, Math.min(width - r, event.x));
      event.subject.fy = Math.max(r, Math.min(height - r, event.y));
    }

    function dragended(event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }

    return () => {
      simulation.stop();
    };
  }, [todos, criticalPath, focusedTaskId, dimensions]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <h2 className="text-xl font-bold text-gray-800">Dependency Graph</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        {/* Graph */}
        <div className="p-1 bg-gray-50/75 flex-grow relative min-h-0">
          <svg
            ref={svgRef}
            className="w-full h-full"
          />
        </div>

        {/* Legend */}
        <div className="p-4 border-t bg-gray-100 shrink-0">
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-blue-500 border-2 border-white ring-1 ring-blue-600"></div>
              <span>Regular Task</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-purple-500 border-2 border-white ring-1 ring-purple-600"></div>
              <span>Critical Path</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-amber-500 border-2 border-white ring-1 ring-amber-600"></div>
              <span>Focused Task</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-0.5 bg-purple-500"></div>
              <span>Critical Link</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-0.5 bg-gray-400"></div>
              <span>Regular Link</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
