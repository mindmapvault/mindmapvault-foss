<map version="freeplane 1.11.0">
  <!-- A genuine FreePlane file: richcontent NODE text instead of a TEXT
       attribute, BACKGROUND_COLOR, hook/attribute/edge elements the parser
       must skip, and a numbered ID on every node. -->
  <node ID="ID_1000000000">
    <richcontent TYPE="NODE">
      <html><head/><body><p>Roadmap</p></body></html>
    </richcontent>
    <hook NAME="MapStyle"/>
    <hook NAME="AutomaticEdgeColor" COUNTER="4"/>
    <node ID="ID_1000000001" POSITION="right" BACKGROUND_COLOR="#ffcccc">
      <richcontent TYPE="NODE">
        <html><head/><body><p>Q1 <b>bold</b> goals</p></body></html>
      </richcontent>
      <attribute NAME="owner" VALUE="alice"/>
      <node ID="ID_1000000002" TEXT="Hire"/>
      <node ID="ID_1000000003" TEXT="Ship beta" FOLDED="true"/>
    </node>
    <node ID="ID_1000000004" POSITION="left" TEXT="Risks">
      <edge COLOR="#808080"/>
      <node ID="ID_1000000005" TEXT="Scope creep"/>
    </node>
  </node>
</map>
