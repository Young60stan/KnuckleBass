"""KnuckleBass 3D asset renderer (Blender bpy, Cycles CPU).

Usage: python3 kb_render.py <job> [samples] [scale]
jobs: main fx eq arp xy window knob woofer_cone woofer_frame
All coordinates are in interface pixels (1 Blender unit = 100 px, y downwards).
"""
import bpy, bmesh, math, sys, os, time

OUT = "/home/claude/render3d/out"
os.makedirs(OUT, exist_ok=True)
CYAN = (0.0, 0.78, 1.0, 1.0)

PAGES = {
    "main": dict(
        boxes=[[20, 10, 300, 178], [20, 198, 300, 178], [20, 386, 300, 172],
               [340, 420, 320, 138], [680, 10, 300, 300], [680, 320, 300, 238]],
        wells=[[34, 146, 272, 36], [198, 236, 108, 130], [200, 478, 106, 70],
               [592, 458, 56, 92], [696, 516, 164, 32], [872, 362, 94, 186], [694, 48, 272, 140]],
        discs=[[500, 205, 172, 152]]),          # woofer baffle: cx, cy, outer r, recess r
    "fx": dict(
        boxes=[[20, 10, 306, 176], [347, 10, 306, 176], [674, 10, 306, 176],
               [20, 196, 306, 176], [347, 196, 306, 176], [674, 196, 306, 176],
               [20, 382, 306, 176], [347, 382, 306, 176], [674, 382, 306, 176]],
        wells=[[194, 48, 120, 68], [443, 98, 198, 76], [848, 48, 120, 128], [32, 336, 282, 28],
               [521, 234, 120, 128], [848, 234, 120, 128], [32, 520, 282, 30],
               [521, 420, 120, 128], [770, 420, 198, 128]]),
    "eq": dict(
        boxes=[[20, 10, 960, 380], [20, 400, 960, 158]],
        wells=[[40, 44, 920, 330]]),
    "arp": dict(
        boxes=[[20, 10, 960, 150], [20, 168, 960, 390]],
        wells=[[120, 204, 840, 10], [120, 220, 840, 120], [120, 350, 840, 100], [120, 460, 840, 86]]),
    "xy": dict(
        boxes=[[14, 4, 560, 560], [588, 10, 392, 548]],
        wells=[[20, 10, 548, 548], [608, 310, 352, 230]]),
}


def px(v):
    return v / 100.0


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.use_denoising = True
    sc.cycles.denoiser = "OPENIMAGEDENOISE"
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.view_settings.exposure = 0.0
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    world = bpy.data.worlds.new("W")
    sc.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.002, 0.003, 0.004, 1)
    bg.inputs[1].default_value = 1.0
    return sc


def mat_metal(name, col, rough=0.36, metal=0.9, brushed=True, bump=0.15):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = col
    p.inputs["Metallic"].default_value = metal
    p.inputs["Roughness"].default_value = rough
    if brushed:
        tc = nt.nodes.new("ShaderNodeTexCoord")
        mp = nt.nodes.new("ShaderNodeMapping")
        mp.inputs["Scale"].default_value = (1.0, 60.0, 1.0)
        nz = nt.nodes.new("ShaderNodeTexNoise")
        nz.inputs["Scale"].default_value = 18.0
        nz.inputs["Detail"].default_value = 8.0
        bp = nt.nodes.new("ShaderNodeBump")
        bp.inputs["Strength"].default_value = bump
        bp.inputs["Distance"].default_value = 0.002
        nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
        nt.links.new(mp.outputs["Vector"], nz.inputs["Vector"])
        nt.links.new(nz.outputs["Fac"], bp.inputs["Height"])
        nt.links.new(bp.outputs["Normal"], p.inputs["Normal"])
        # subtle roughness variation
        mr = nt.nodes.new("ShaderNodeMapRange")
        mr.inputs["To Min"].default_value = rough - 0.06
        mr.inputs["To Max"].default_value = rough + 0.06
        nt.links.new(nz.outputs["Fac"], mr.inputs["Value"])
        nt.links.new(mr.outputs["Result"], p.inputs["Roughness"])
    return m


def mat_emit(name, col, strength):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = col
    em.inputs["Strength"].default_value = strength
    nt.links.new(em.outputs[0], out.inputs[0])
    return m


def mat_glass_screen(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (0.002, 0.004, 0.005, 1)
    p.inputs["Metallic"].default_value = 0.0
    p.inputs["Roughness"].default_value = 0.08
    p.inputs["Coat Weight"].default_value = 1.0
    p.inputs["Coat Roughness"].default_value = 0.03
    return m


def add_box(name, x, y, w, h, z0, z1, mat):
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.active_object
    o.name = name
    o.scale = (px(w), px(h), z1 - z0)
    o.location = (px(x + w / 2), -px(y + h / 2), (z0 + z1) / 2)
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(mat)
    return o


def add_cyl(name, cx, cy, r, z0, z1, mat, verts=128):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=px(r), depth=z1 - z0,
                                        location=(px(cx), -px(cy), (z0 + z1) / 2))
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(mat)
    return o


def boolean_cut(obj, cutter):
    mod = obj.modifiers.new("cut", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.object = cutter
    mod.solver = "EXACT"
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter, do_unlink=True)


def bevel(obj, width, segs=4, angle=40):
    mod = obj.modifiers.new("bev", "BEVEL")
    mod.width = width
    mod.segments = segs
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(angle)
    mod.harden_normals = True
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    for o in bpy.context.selected_objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.ops.object.shade_auto_smooth(angle=math.radians(35))


def add_screw(cx, cy, z, mat_head, mat_slot):
    head = add_cyl("screw", cx, cy, 4.2, z, z + 0.018, mat_head, 32)
    bevel(head, 0.012, 3, 30)
    slot = add_box("slot", cx - 3.4, cy - 0.7, 6.8, 1.4, z + 0.012, z + 0.03, mat_slot)
    boolean_cut(head, slot)


def setup_camera_lights(sc, w, h, scale):
    cam_data = bpy.data.cameras.new("Cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = px(max(w, h))
    cam = bpy.data.objects.new("Cam", cam_data)
    sc.collection.objects.link(cam)
    cam.location = (px(w / 2), -px(h / 2), 20)
    sc.camera = cam
    sc.render.resolution_x = int(w * scale)
    sc.render.resolution_y = int(h * scale)

    # key light from top-left
    sun = bpy.data.lights.new("Key", "SUN")
    sun.energy = 4.0
    sun.angle = math.radians(6)
    so = bpy.data.objects.new("Key", sun)
    sc.collection.objects.link(so)
    so.rotation_euler = (math.radians(58), math.radians(0), math.radians(-135))

    # soft overhead fill (reflected by the flat metal tops)
    fill = bpy.data.lights.new("Fill", "AREA")
    fill.energy = 140
    fill.size = 14
    fo = bpy.data.objects.new("Fill", fill)
    sc.collection.objects.link(fo)
    fo.location = (px(w / 2), -px(h / 2), 9)

    # cyan rim lights, low angle from the right and bottom
    for i, (lx, ly, rz) in enumerate([(px(w) + 4, -px(h / 2), 90), (px(w / 2), -px(h) - 4, 0)]):
        rim = bpy.data.lights.new("Rim%d" % i, "AREA")
        rim.energy = 380
        rim.size = 10
        rim.color = (0.1, 0.85, 1.0)
        ro = bpy.data.objects.new("Rim%d" % i, rim)
        sc.collection.objects.link(ro)
        ro.location = (lx, ly, 1.2)
        d = (px(w / 2) - lx, -px(h / 2) - ly, -1.2)
        ro.rotation_euler = (math.atan2(math.hypot(d[0], d[1]), -d[2]) , 0, math.atan2(d[1], d[0]) + math.pi / 2)
    return cam


def build_page(job, scale, samples):
    sc = reset()
    sc.cycles.samples = samples
    W, H = 1000, 568
    data = PAGES[job]

    base_m = mat_metal("Base", (0.006, 0.008, 0.010, 1), rough=0.6, metal=0.5, bump=0.08)
    plate_m = mat_metal("Plate", (0.05, 0.065, 0.075, 1), rough=0.38, metal=0.95, bump=0.22)
    well_m = mat_glass_screen("Well")
    screw_m = mat_metal("Screw", (0.32, 0.36, 0.40, 1), rough=0.28, metal=1.0, brushed=False)
    slot_m = mat_metal("Slot", (0.01, 0.01, 0.01, 1), rough=0.6, metal=0.2, brushed=False)
    glow_m = mat_emit("Glow", CYAN, 0.9)

    # base plate (fills the page)
    add_box("base", -20, -20, W + 40, H + 40, -0.05, 0.0, base_m)

    TOP = 0.075
    for i, (x, y, w, h) in enumerate(data["boxes"]):
        # cyan underglow peeking out around the plate
        g = add_box("glow%d" % i, x - 1.5, y - 1.5, w + 3, h + 3, 0.0005, 0.002, glow_m)
        plate = add_box("plate%d" % i, x, y, w, h, 0.012, TOP, plate_m)
        # engraved header groove
        groove = add_box("groove%d" % i, x + 10, y + 33, w - 20, 1.6, TOP - 0.006, TOP + 0.05, slot_m)
        boolean_cut(plate, groove)
        # display wells inside this plate
        for (wx, wy, ww, wh) in data["wells"]:
            if wx >= x and wy >= y and wx + ww <= x + w and wy + wh <= y + h:
                cut = add_box("wellcut", wx - 4, wy - 4, ww + 8, wh + 8, TOP - 0.035, TOP + 0.1, slot_m)
                boolean_cut(plate, cut)
                add_box("screen", wx - 4, wy - 4, ww + 8, wh + 8, TOP - 0.036, TOP - 0.034, well_m)
        bevel(plate, 0.045, 6, 40)
        for (sx, sy) in [(x + 10, y + 10), (x + w - 10, y + 10), (x + 10, y + h - 10), (x + w - 10, y + h - 10)]:
            add_screw(sx, sy, TOP - 0.004, screw_m, slot_m)

    for (cx, cy, ro, ri) in data.get("discs", []):
        add_cyl("baffleglow", cx, cy, ro + 2, 0.0005, 0.002, glow_m, 192)
        disc = add_cyl("baffle", cx, cy, ro, 0.012, TOP, plate_m, 192)
        rec = add_cyl("recess", cx, cy, ri, TOP - 0.05, TOP + 0.1, slot_m, 192)
        boolean_cut(disc, rec)
        add_cyl("recessfloor", cx, cy, ri - 1, TOP - 0.049, TOP - 0.047, well_m, 192)
        bevel(disc, 0.045, 6, 40)
        for k in range(8):
            a = k * math.pi / 4 + math.pi / 8
            add_screw(cx + math.cos(a) * (ri + 10), cy + math.sin(a) * (ri + 10), TOP - 0.004, screw_m, slot_m)

    setup_camera_lights(sc, W, H, scale)
    sc.render.film_transparent = False
    return sc


def build_window(scale, samples):
    sc = reset()
    sc.cycles.samples = samples
    W, H = 1000, 680
    base_m = mat_metal("Base", (0.010, 0.013, 0.016, 1), rough=0.55, metal=0.6, bump=0.08)
    bar_m = mat_metal("Bar", (0.026, 0.033, 0.040, 1), rough=0.32, metal=0.92, bump=0.2)
    glow_m = mat_emit("Glow", CYAN, 3.0)
    well_m = mat_glass_screen("Well")
    slot_m = mat_metal("Slot", (0.01, 0.01, 0.01, 1), rough=0.6, metal=0.2, brushed=False)
    add_box("base", -20, -20, W + 40, H + 40, -0.05, 0.0, base_m)
    # header bar with cyan light strip under its lower edge
    add_box("hglow", 0, 62, W, 3, 0.0005, 0.003, glow_m)
    hb = add_box("header", -10, -10, W + 20, 72, 0.01, 0.07, bar_m)
    # recessed slot for the preset name
    cut = add_box("pcut", 795, 17, 160, 34, 0.04, 0.2, slot_m)
    boolean_cut(hb, cut)
    add_box("pscreen", 795, 17, 160, 34, 0.039, 0.041, well_m)
    bevel(hb, 0.025, 5, 40)
    # footer bar
    add_box("fglow", 0, 645, W, 2, 0.0005, 0.003, glow_m)
    fb = add_box("footer", -10, 647, W + 20, 50, 0.01, 0.05, bar_m)
    bevel(fb, 0.02, 4, 40)
    setup_camera_lights(sc, W, H, scale)
    sc.render.film_transparent = False
    return sc


def build_knob(scale, samples):
    """Knob body (rotationally symmetric) rendered top-down with a contact shadow."""
    sc = reset()
    sc.cycles.samples = samples
    S = 200  # px canvas
    knurl_m = mat_metal("Knurl", (0.05, 0.06, 0.07, 1), rough=0.3, metal=1.0, brushed=False)
    cap_m = bpy.data.materials.new("Cap")
    cap_m.use_nodes = True
    nt = cap_m.node_tree
    p = nt.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (0.035, 0.045, 0.052, 1)
    p.inputs["Metallic"].default_value = 1.0
    p.inputs["Roughness"].default_value = 0.4
    # concentric machining rings on the cap
    tc = nt.nodes.new("ShaderNodeTexCoord")
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.wave_type = "RINGS"
    wave.inputs["Scale"].default_value = 90.0
    wave.inputs["Distortion"].default_value = 0.0
    bp = nt.nodes.new("ShaderNodeBump")
    bp.inputs["Strength"].default_value = 0.03
    nt.links.new(tc.outputs["Object"], wave.inputs["Vector"])
    nt.links.new(wave.outputs["Fac"], bp.inputs["Height"])
    nt.links.new(bp.outputs["Normal"], p.inputs["Normal"])

    skirt_m = mat_metal("Skirt", (0.012, 0.015, 0.018, 1), rough=0.45, metal=0.7, brushed=False)

    cx, cy = S / 2, S / 2
    # shadow catcher
    bpy.ops.mesh.primitive_plane_add(size=6, location=(px(cx), -px(cy), 0))
    pl = bpy.context.active_object
    pl.is_shadow_catcher = True

    # skirt (wide dark base ring)
    sk = add_cyl("skirt", cx, cy, 78, 0.0, 0.10, skirt_m, 192)
    bevel(sk, 0.03, 5, 40)
    # knurled body: cylinder with vertical ridges
    bpy.ops.mesh.primitive_cylinder_add(vertices=240, radius=px(64), depth=0.34, location=(px(cx), -px(cy), 0.27))
    body = bpy.context.active_object
    body.data.materials.append(knurl_m)
    bm = bmesh.new()
    bm.from_mesh(body.data)
    for v in bm.verts:
        a = math.atan2(v.co.y, v.co.x)
        r = math.hypot(v.co.x, v.co.y)
        if r > 0.1:
            k = 1.0 + 0.035 * (1 if (int(round(a / (2 * math.pi) * 120)) % 2 == 0) else 0)
            v.co.x *= k
            v.co.y *= k
    bm.to_mesh(body.data)
    bm.free()
    bevel(body, 0.035, 4, 30)
    # top cap: slightly domed disc
    bpy.ops.mesh.primitive_uv_sphere_add(segments=128, ring_count=64, radius=px(58), location=(px(cx), -px(cy), 0.43))
    cap = bpy.context.active_object
    cap.scale = (1, 1, 0.12)
    bpy.ops.object.transform_apply(scale=True)
    cap.data.materials.append(cap_m)
    for poly in cap.data.polygons:
        poly.use_smooth = True

    cam_data = bpy.data.cameras.new("Cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = px(S)
    cam = bpy.data.objects.new("Cam", cam_data)
    sc.collection.objects.link(cam)
    cam.location = (px(cx), -px(cy), 20)
    sc.camera = cam
    sc.render.resolution_x = int(S * scale)
    sc.render.resolution_y = int(S * scale)
    sun = bpy.data.lights.new("Key", "SUN")
    sun.energy = 3.5
    sun.angle = math.radians(10)
    so = bpy.data.objects.new("Key", sun)
    sc.collection.objects.link(so)
    so.rotation_euler = (math.radians(35), math.radians(-22), math.radians(-35))
    fill = bpy.data.lights.new("Fill", "AREA")
    fill.energy = 22
    fill.size = 3
    fo = bpy.data.objects.new("Fill", fill)
    sc.collection.objects.link(fo)
    fo.location = (px(cx), -px(cy), 4)
    rim = bpy.data.lights.new("Rim", "AREA")
    rim.energy = 60
    rim.size = 2
    rim.color = (0.1, 0.85, 1.0)
    ro = bpy.data.objects.new("Rim", rim)
    sc.collection.objects.link(ro)
    ro.location = (px(cx) + 2.2, -px(cy) - 2.2, 0.6)
    ro.rotation_euler = (math.radians(75), 0, math.radians(45))
    sc.render.film_transparent = True
    return sc


def build_woofer(part, scale, samples):
    """Same framing as the old PNGs: square canvas, radius fractions of half-size."""
    sc = reset()
    sc.cycles.samples = samples
    S = 512
    R = S / 2
    cx = cy = R
    rubber = mat_metal("Rubber", (0.012, 0.013, 0.015, 1), rough=0.55, metal=0.0, brushed=False)
    cone_m = bpy.data.materials.new("Cone")
    cone_m.use_nodes = True
    nt = cone_m.node_tree
    p = nt.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (0.045, 0.055, 0.062, 1)
    p.inputs["Metallic"].default_value = 0.25
    p.inputs["Roughness"].default_value = 0.5
    tc = nt.nodes.new("ShaderNodeTexCoord")
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.wave_type = "RINGS"
    wave.inputs["Scale"].default_value = 14.0
    bp = nt.nodes.new("ShaderNodeBump")
    bp.inputs["Strength"].default_value = 0.6
    nt.links.new(tc.outputs["Object"], wave.inputs["Vector"])
    nt.links.new(wave.outputs["Fac"], bp.inputs["Height"])
    nt.links.new(bp.outputs["Normal"], p.inputs["Normal"])
    cap_m = mat_metal("DustCap", (0.16, 0.20, 0.23, 1), rough=0.18, metal=1.0, brushed=False)
    frame_m = mat_metal("Frame", (0.035, 0.042, 0.05, 1), rough=0.3, metal=0.95, bump=0.2)
    screw_m = mat_metal("Screw", (0.32, 0.36, 0.40, 1), rough=0.28, metal=1.0, brushed=False)
    slot_m = mat_metal("Slot", (0.01, 0.01, 0.01, 1), rough=0.6, metal=0.2, brushed=False)
    glow_m = mat_emit("Glow", CYAN, 2.2)

    if part == "cone":
        # surround (half torus) r 0.70..0.87 of R
        r_in, r_out = 0.70 * R, 0.87 * R
        bpy.ops.mesh.primitive_torus_add(major_radius=px((r_in + r_out) / 2), minor_radius=px((r_out - r_in) / 2),
                                         major_segments=192, minor_segments=48, location=(px(cx), -px(cy), 0.0))
        t = bpy.context.active_object
        t.scale = (1, 1, 0.55)
        t.data.materials.append(rubber)
        for poly in t.data.polygons:
            poly.use_smooth = True
        # cone: inverted cone from r_in down to dust cap
        bpy.ops.mesh.primitive_cone_add(vertices=192, radius1=px(0.26 * R), radius2=px(r_in), depth=0.55,
                                        end_fill_type="NOTHING", location=(px(cx), -px(cy), -0.25))
        c = bpy.context.active_object
        c.data.materials.append(cone_m)
        for poly in c.data.polygons:
            poly.use_smooth = True
        # dust cap dome
        bpy.ops.mesh.primitive_uv_sphere_add(segments=128, ring_count=64, radius=px(0.255 * R), location=(px(cx), -px(cy), -0.52))
        d = bpy.context.active_object
        d.scale = (1, 1, 0.6)
        d.data.materials.append(cap_m)
        for poly in d.data.polygons:
            poly.use_smooth = True
        # thin cyan rings: cone edge and dust-cap edge
        for rr, zz in ((0.70 * R, 0.0), (0.27 * R, -0.47)):
            bpy.ops.mesh.primitive_torus_add(major_radius=px(rr), minor_radius=px(1.1), major_segments=192,
                                             minor_segments=8, location=(px(cx), -px(cy), zz))
            bpy.context.active_object.data.materials.append(glow_m)
    else:
        # basket ring r 0.855..0.985 of R with screws
        ring = add_cyl("ring", cx, cy, 0.985 * R, -0.06, 0.06, frame_m, 256)
        hole = add_cyl("hole", cx, cy, 0.86 * R, -0.5, 0.5, slot_m, 256)
        boolean_cut(ring, hole)
        bevel(ring, 0.035, 6, 40)
        for rr in (0.985 * R + 1, 0.858 * R):
            bpy.ops.mesh.primitive_torus_add(major_radius=px(rr), minor_radius=px(1.0), major_segments=256,
                                             minor_segments=8, location=(px(cx), -px(cy), 0.03))
            bpy.context.active_object.data.materials.append(glow_m)
        for k in range(8):
            a = k * math.pi / 4 + math.pi / 8
            add_screw(cx + math.cos(a) * 0.92 * R, cy + math.sin(a) * 0.92 * R, 0.055, screw_m, slot_m)

    cam_data = bpy.data.cameras.new("Cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = px(S)
    cam = bpy.data.objects.new("Cam", cam_data)
    sc.collection.objects.link(cam)
    cam.location = (px(cx), -px(cy), 20)
    sc.camera = cam
    sc.render.resolution_x = int(S * scale)
    sc.render.resolution_y = int(S * scale)
    sun = bpy.data.lights.new("Key", "SUN")
    sun.energy = 3.0
    sun.angle = math.radians(10)
    so = bpy.data.objects.new("Key", sun)
    sc.collection.objects.link(so)
    so.rotation_euler = (math.radians(38), math.radians(-24), math.radians(-35))
    fill = bpy.data.lights.new("Fill", "AREA")
    fill.energy = 300
    fill.size = 8
    fo = bpy.data.objects.new("Fill", fill)
    sc.collection.objects.link(fo)
    fo.location = (px(cx), -px(cy), 6)
    rim = bpy.data.lights.new("Rim", "AREA")
    rim.energy = 200
    rim.size = 6
    rim.color = (0.1, 0.85, 1.0)
    ro = bpy.data.objects.new("Rim", rim)
    sc.collection.objects.link(ro)
    ro.location = (px(cx) + 5, -px(cy) - 5, 1.2)
    ro.rotation_euler = (math.radians(70), 0, math.radians(45))
    sc.render.film_transparent = True
    return sc


if __name__ == "__main__":
    job = sys.argv[1]
    samples = int(sys.argv[2]) if len(sys.argv) > 2 else 48
    scale = float(sys.argv[3]) if len(sys.argv) > 3 else 2.0
    t0 = time.time()
    if job in PAGES:
        sc = build_page(job, scale, samples)
        name = "page_%s.png" % job
    elif job == "window":
        sc = build_window(scale, samples)
        name = "bg_window.png"
    elif job == "knob":
        sc = build_knob(scale, samples)
        name = "knob_body.png"
    elif job in ("woofer_cone", "woofer_frame"):
        sc = build_woofer(job.split("_")[1], scale, samples)
        name = "woofer3d_%s.png" % job.split("_")[1]

    sc.render.threads_mode = "FIXED"
    sc.render.threads = 2
    sc.render.filepath = os.path.join(OUT, name)
    bpy.ops.render.render(write_still=True)
    print("RENDERED", name, "in %.1fs" % (time.time() - t0))
