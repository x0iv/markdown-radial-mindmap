function parseMarkdownToJSON(markdown) {
    const lines = markdown.split('\n').filter(line => line.trim().startsWith('-'));
    const root = { name: "root", children: [] };
    const stack = [{ node: root, indent: -1 }];

    lines.forEach(line => {
        const indent = line.search(/\S/);
        const name = line.slice(indent + 1).trim();
        const node = { name, children: [] };

        while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
            stack.pop();
        }

        const parent = stack[stack.length - 1].node;
        parent.children.push(node);
        stack.push({ node, indent });
    });

    return root.children.length === 1 ? root.children[0] : root;
}

// Global variables for D3 simulation
let svg, zoomableLayer, simulation, root, nodes, links;

// Utility to get radius based on text size
function getRadius(d, config) {
    const textNode = d3.select(`#text-${d.id}`).node();
    if (textNode) {
        const bbox = textNode.getBBox();
        return Math.max(bbox.width, bbox.height) + config.nodePaddingX;
    }
    return 50;
}

function click(event, d) {
    if (d.children) {
        d._children = d.children;
        d.children = null;
    } else {
        d.children = d._children;
        d._children = null;
    }
    updateSimulation();
}

function ticked(config) {
    links = root.links();

    zoomableLayer.select(".links")
        .selectAll(".link")
        .data(links)
        .join("line")
        .classed("link", true)
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y)
        .attr("stroke", config.linkColor);

    const node = zoomableLayer.select(".nodes")
        .selectAll(".node")
        .data(nodes)
        .join("g")
        .classed("node", true)
        .attr("transform", d => `translate(${d.x},${d.y})`)
        .on("click", click);

    // Text rendering
    const texts = node.selectAll("text").data(d => [d]);
    texts.enter().append("text")
        .attr("id", d => `text-${d.id}`)
        .merge(texts)
        .style("font-size", d => `${config.rootFontSize - d.depth * config.fontSizeDelta}px`)
        .style("font-family", config.fontFamily)
        .each(function (d) {
            const textSelection = d3.select(this);
            const tspanUpdate = textSelection.selectAll("tspan").data(d.data.name.split("\n").map(textLine => ({
                text: textLine,
                depth: d.depth
            })));

            tspanUpdate.enter()
                .append("tspan")
                .merge(tspanUpdate)
                .attr("x", 0)
                .attr("dy", (d, i) => `${(i + 0.25) * (config.rootFontSize - d.depth * config.fontSizeDelta)}px`)
                .text(d => d.text);

            tspanUpdate.exit().remove();
        });

    texts.exit().remove();

    // Ellipse rendering
    const ellipses = node.selectAll("ellipse").data(d => [d]);
    ellipses.enter().append("ellipse")
        .merge(ellipses)
        .each(function (d) {
            const size = d3.select(this.parentNode).select("text").node().getBBox();
            d3.select(this)
                .attr("rx", size.width / 2 + config.nodePaddingX)
                .attr("ry", size.height / 2 + config.nodePaddingY)
                .style("fill", d.depth === 0 ? config.rootNodeColor : config.nodeColor)
                .style("stroke", config.nodeStrokeColor)
                .style("stroke-dasharray", d => d._children ? "2,2" : "0,0")
                .style("stroke-width", d => d._children ? 3 : 1);
        });
    ellipses.exit().remove();

    node.each(function (d) {
        const size = this.querySelector("text").getBBox();
        const lineHeight = config.rootFontSize - d.depth * config.fontSizeDelta;
        d.bbox = size;
        d3.select(this).selectAll("tspan").each(function (d, i) {
            d3.select(this)
                .attr("x", -size.width / 2)
                .attr("y", (d, i) => i ? lineHeight / 2 : -(size.height / 2 - lineHeight / 2));
        });
        d3.select(this).select("text").raise();
    });
}

function updateSimulation(config) {
    links = root.links();
    nodes = root.descendants();
    simulation.force("link").links(links);
    simulation.nodes(nodes);
    simulation.alpha(1).restart();
}

function zoomed(event) {
    zoomableLayer.attr("transform", event.transform);
}

function updateMindMap(markdownContent, config) {
    data = parseMarkdownToJSON(markdownContent);
    root = d3.hierarchy(data);
    links = root.links();
    nodes = root.descendants();

    // If first time: initialize SVG and simulation
    if (!svg) {
        svg = d3.select("svg");
        const width = document.body.clientWidth;
        const height = document.body.clientHeight;
        svg.attr("viewBox", [-width / 2, -height / 2, width, height]);
        zoomableLayer = svg.append("g").attr("class", "zoom-layer");
        zoomableLayer.append("g").attr("class", "links");
        zoomableLayer.append("g").attr("class", "nodes");

        svg.call(
            d3.zoom()
                .scaleExtent([0.1, 4])
                .on("zoom", zoomed)
        );

        simulation = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(links).id(d => d.id).distance(d => 250 + getRadius(d.source, config) + getRadius(d.target, config)))
            .force("charge", d3.forceManyBody().strength(d => -800 - getRadius(d, config) * 15))
            .force("center", d3.forceCenter(0, 0))
            .force("collide", d3.forceCollide().radius(d => getRadius(d, config)).strength(1.0).iterations(8))
            .on("tick", () => ticked(config));
    } else {
        simulation.nodes(nodes);
        simulation.force("link").links(links);
        simulation.alpha(1).restart();
    }
    ticked(config);
}

window.addEventListener('resize', resizeSVG);
function resizeSVG() {
    const svgElem = document.querySelector('svg');
    if (svgElem) {
        svgElem.style.width = window.innerWidth + 'px';
        svgElem.style.height = window.innerHeight + 'px';
    }
}
resizeSVG();
